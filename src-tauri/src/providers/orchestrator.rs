use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};
use futures::StreamExt;
use serde_json::Value;

use crate::providers::traits::{LLMProvider, ProviderEvent};
use crate::providers::{ChatMessage, ProviderConfig, ChatOptions};
use crate::mcp::McpClient;

pub struct ChatOrchestrator {
    app: AppHandle,
    provider: Box<dyn LLMProvider + Send + Sync>,
    mcp_clients: Arc<Mutex<HashMap<String, Arc<McpClient>>>>,
}

impl ChatOrchestrator {
    pub fn new(
        app: AppHandle,
        provider: Box<dyn LLMProvider + Send + Sync>,
        mcp_clients: Arc<Mutex<HashMap<String, Arc<McpClient>>>>,
    ) -> Self {
        Self { app, provider, mcp_clients }
    }

    pub async fn run_conversation(
        &self,
        config: &ProviderConfig,
        model: &str,
        initial_messages: Vec<ChatMessage>,
        options: Option<ChatOptions>,
        stream_id: &str,
        should_cancel: Arc<AtomicBool>,
    ) -> anyhow::Result<()> {
        let mut messages = initial_messages;
        
        // 1. Gather tools from active MCP clients
        let (tools, tool_mapping) = self.gather_tools().await;
        
        let mut loop_count = 0;
        const MAX_LOOPS: i32 = 10;
        
        // Emit stream start event
        let _ = self.app.emit("chat:stream-start", serde_json::json!({"stream_id": stream_id}));

        loop {
            if loop_count >= MAX_LOOPS {
                println!("Max loops reached for conversation.");
                break;
            }
            loop_count += 1;
            
            if should_cancel.load(Ordering::Acquire) {
                 let _ = self.app.emit("chat:cancelled", serde_json::json!({"stream_id": stream_id}));
                 return Ok(());
            }

            // Start stream from provider
            let mut stream = match self.provider.stream_chat(config, model, &messages, tools.clone(), options.clone()).await {
                Ok(s) => s,
                Err(e) => {
                    let _ = self.app.emit("chat:error", serde_json::json!({"stream_id": stream_id, "error": e.to_string()}));
                    return Err(e);
                }
            };

            let mut full_content = String::new();
            let mut tool_calls = Vec::new();

            while let Some(event) = stream.next().await {
                 if should_cancel.load(Ordering::Acquire) {
                     break;
                 }
                 
                 match event {
                     ProviderEvent::Content(s) => {
                         full_content.push_str(&s);
                         // Emit chunk to frontend
                         let _ = self.app.emit("chat:chunk", serde_json::json!({
                             "stream_id": stream_id,
                             "message": { "role": "assistant", "content": s },
                             "done": false
                         }));
                     },
                     ProviderEvent::ToolCall(tc) => {
                         tool_calls.push(tc);
                     },
                     ProviderEvent::Error(e) => {
                          let _ = self.app.emit("chat:error", serde_json::json!({"stream_id": stream_id, "error": e}));
                          return Err(anyhow::anyhow!(e));
                     },
                     ProviderEvent::Usage(_) => {
                         // Usage stats can be handled here if needed
                     }
                 }
            }
            
            if should_cancel.load(Ordering::Acquire) {
                 let _ = self.app.emit("chat:cancelled", serde_json::json!({"stream_id": stream_id}));
                 return Ok(());
            }

            // If no tool calls, we are done
            if tool_calls.is_empty() {
                // Emit final chunk with done=true
                let _ = self.app.emit("chat:chunk", serde_json::json!({
                     "stream_id": stream_id,
                     "message": { "role": "assistant", "content": "" },
                     "done": true
                 }));
                 let _ = self.app.emit("chat:complete", serde_json::json!({"stream_id": stream_id, "completed": true}));
                break;
            }
            
            // Handle tool calls - This is the "Loop" part
            
            // 1. Append assistant message with content and tool_calls
            messages.push(ChatMessage {
                role: "assistant".to_string(),
                content: full_content,
                images: None,
                tool_calls: Some(tool_calls.clone()),
                tool_call_id: None, 
            });
            
            // 2. Execute tools
            for call in tool_calls {
                 if let Some(function) = call.get("function") {
                     let name = function.get("name").and_then(|n| n.as_str()).unwrap_or_default();
                     let args_str = function.get("arguments").and_then(|v| v.as_str()).unwrap_or("{}");
                     let call_id = call.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                     
                     let args = serde_json::from_str(args_str).unwrap_or(serde_json::json!({}));

                     // Notify frontend of tool execution
                     let _ = self.app.emit("chat:tool-start", serde_json::json!({
                         "stream_id": stream_id,
                         "tool": name,
                         "args": args
                     }));
                     
                     if let Some(client_name) = tool_mapping.get(name) {
                         let mcp_client = self.mcp_clients.lock().ok()
                             .and_then(|map| map.get(client_name).cloned());
                         if let Some(mcp_client) = mcp_client {
                             println!("Executing tool {} on client {}", name, client_name);
                             
                             let result_content = match mcp_client.call_tool(name, args).await {
                                 Ok(res) => {
                                     let mut text = String::new();
                                     for item in res.content {
                                         match item {
                                             crate::mcp::protocol::Content::Text { text: t } => {
                                                 text.push_str(&t);
                                                 text.push('\n');
                                             },
                                             crate::mcp::protocol::Content::Resource { text: Some(t), .. } => {
                                                 text.push_str(&t);
                                                 text.push('\n');
                                             },
                                             _ => {}
                                         }
                                     }
                                     
                                     // Truncate large results to prevent context overflow
                                     const MAX_RESULT_CHARS: usize = 8000;
                                     if text.len() > MAX_RESULT_CHARS {
                                         let truncated = &text[..MAX_RESULT_CHARS];
                                         // Find last newline for cleaner cut
                                         let cut_point = truncated.rfind('\n').unwrap_or(MAX_RESULT_CHARS);
                                         format!(
                                             "{}\n\n[... Output truncated. Showing {}/{} characters. Consider using more specific queries or filters to reduce output size.]",
                                             &text[..cut_point],
                                             cut_point,
                                             text.len()
                                         )
                                     } else {
                                         text
                                     }
                                 },
                                 Err(e) => format!("Error executing tool: {}", e),
                             };
                             
                             // Append tool result
                             messages.push(ChatMessage {
                                 role: "tool".to_string(),
                                 content: result_content,
                                 images: None,
                                 tool_calls: None,
                                 tool_call_id: Some(call_id),
                             });
                         } else {
                             eprintln!("McpClient {} not found for tool {}", client_name, name);
                             messages.push(ChatMessage {
                                 role: "tool".to_string(),
                                 content: format!("Error: Client {} not found", client_name),
                                 images: None,
                                 tool_calls: None,
                                 tool_call_id: Some(call_id),
                             });
                         }
                     } else {
                         eprintln!("No client mapping found for tool {}", name);
                         messages.push(ChatMessage {
                             role: "tool".to_string(),
                             content: format!("Error: No client found for tool {}", name),
                             images: None,
                             tool_calls: None,
                             tool_call_id: Some(call_id),
                         });
                     }
                 }
            }
            
            // Loop continues to feed tool results back to provider
        }
        
        Ok(())
    }
    
    async fn gather_tools(&self) -> (Option<Vec<Value>>, HashMap<String, String>) {
        let mut available_tools = Vec::new();
        let mut tool_mapping = HashMap::new();

        let client_refs: Vec<(String, Arc<McpClient>)> = self.mcp_clients.lock().ok()
            .map(|map| map.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
            .unwrap_or_default();

        for (client_name, mcp_client) in &client_refs {
            if let Ok(tools) = mcp_client.list_tools().await {
                for tool in tools {
                    let mut schema = tool.input_schema.clone();
                    if let serde_json::Value::Object(ref mut map) = schema {
                        map.remove("$schema");
                    }
                    available_tools.push(serde_json::json!({
                        "type": "function",
                        "function": {
                            "name": tool.name,
                            "description": tool.description,
                            "parameters": schema
                        }
                    }));
                    tool_mapping.insert(tool.name.clone(), client_name.clone());
                }
            }
        }
        
        let tools = if available_tools.is_empty() { None } else { Some(available_tools) };
        (tools, tool_mapping)
    }
}
