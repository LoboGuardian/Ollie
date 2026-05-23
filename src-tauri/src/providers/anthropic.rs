//! Anthropic (Claude) API provider

use async_trait::async_trait;
use futures::{stream::BoxStream, Stream};
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::VecDeque;
use std::pin::Pin;
use std::task::{Context, Poll};
use crate::providers::traits::{LLMProvider, ProviderEvent, Usage};
use crate::providers::{ChatMessage, ProviderConfig, ChatOptions};

const ANTHROPIC_VERSION: &str = "2023-06-01";

#[derive(Debug, Serialize)]
struct AnthropicRequest {
    model: String,
    messages: Vec<AnthropicMessage>,
    max_tokens: i32,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
struct AnthropicMessage {
    role: String,
    content: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct AnthropicStreamEvent {
    #[serde(rename = "type")]
    event_type: String,
    delta: Option<AnthropicDelta>,
    content_block: Option<AnthropicContentBlock>,
    usage: Option<AnthropicUsage>, // message_start has usage (input token count)
}

#[derive(Debug, Deserialize)]
struct AnthropicDelta {
    #[serde(rename = "type")]
    #[allow(dead_code)]
    delta_type: Option<String>,
    text: Option<String>,
    partial_json: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicContentBlock {
    #[serde(rename = "type")]
    block_type: String,
    id: Option<String>,
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicUsage {
    input_tokens: Option<i32>,
    output_tokens: Option<i32>,
}

pub struct AnthropicProvider;

#[async_trait]
impl LLMProvider for AnthropicProvider {
    async fn stream_chat(
        &self,
        config: &ProviderConfig,
        model: &str,
        messages: &[ChatMessage],
        tools: Option<Vec<serde_json::Value>>,
        options: Option<ChatOptions>,
    ) -> anyhow::Result<BoxStream<'static, ProviderEvent>> {
        let api_key = config.api_key.as_ref()
            .ok_or_else(|| anyhow::anyhow!("Anthropic API key is required"))?;

        let base_url = config.get_base_url();
        let endpoint = format!("{}/v1/messages", base_url);

        let mut headers = HeaderMap::new();
        headers.insert("x-api-key", HeaderValue::from_str(api_key)?);
        headers.insert("anthropic-version", HeaderValue::from_static(ANTHROPIC_VERSION));
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let (system_prompt, anthropic_messages) = convert_messages(messages);
        
        let mut request_body = AnthropicRequest {
            model: model.to_string(),
            messages: anthropic_messages,
            max_tokens: 4096,
            stream: true,
            system: system_prompt,
            tools: convert_tools(tools),
            temperature: None,
        };
        
        if let Some(opts) = options {
            request_body.temperature = opts.temperature;
            if let Some(mt) = opts.max_tokens {
                request_body.max_tokens = mt;
            }
        }

        let client = reqwest::Client::new();
        let response = client
            .post(&endpoint)
            .headers(headers)
            .json(&request_body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!("Anthropic API error {}: {}", status, error_text));
        }

        let stream = response.bytes_stream();
        Ok(Box::pin(AnthropicStream::new(Box::pin(stream))))
    }
}

fn convert_messages(messages: &[ChatMessage]) -> (Option<String>, Vec<AnthropicMessage>) {
    let mut system_prompt = None;
    let mut anthropic_messages = Vec::new();

    for msg in messages {
        if msg.role == "system" {
            system_prompt = Some(msg.content.clone());
            continue;
        }

        let role = match msg.role.as_str() {
            "user" => "user",
            "assistant" => "assistant",
            "tool" => "user",
            _ => "user",
        };

        // Handle tool results
        if msg.role == "tool" {
            let tool_use_id = match &msg.tool_call_id {
                Some(id) if !id.is_empty() => id.clone(),
                _ => {
                    eprintln!("Skipping tool result message with missing tool_call_id");
                    continue;
                }
            };
            let content = json!([{
                "type": "tool_result",
                "tool_use_id": tool_use_id,
                "content": msg.content
            }]);
            anthropic_messages.push(AnthropicMessage {
                role: role.to_string(),
                content,
            });
            continue;
        }

        let content = if let Some(images) = &msg.images {
            if !images.is_empty() {
                let mut content_parts = vec![json!({
                    "type": "text",
                    "text": msg.content
                })];
                for image in images {
                    content_parts.push(json!({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": image
                        }
                    }));
                }
                serde_json::Value::Array(content_parts)
            } else {
                serde_json::Value::String(msg.content.clone())
            }
        } else {
            serde_json::Value::String(msg.content.clone())
        };

        // Handle assistant tool calls (if present in history)
        // Previous logic in chat.rs didn't explicitly convert assistant tool calls back to Anthropic format 
        // because ChatMessage.tool_calls was generic.
        // We SHOULD replicate them if we want proper history.
        // But for now, let's keep it simple or check if ChatMessage has tool_calls.
        
        let final_content = if let Some(calls) = &msg.tool_calls {
             if !calls.is_empty() {
                 // If there's content AND tool calls, Anthropic expects array of blocks
                 let mut parts = Vec::new();
                 if !msg.content.is_empty() {
                     parts.push(json!({"type": "text", "text": msg.content}));
                 }
                 for call in calls {
                     if let Some(func) = call.get("function") {
                          parts.push(json!({
                              "type": "tool_use",
                              "id": call.get("id"),
                              "name": func.get("name"),
                              "input": serde_json::from_str::<serde_json::Value>(func.get("arguments").and_then(|a| a.as_str()).unwrap_or("{}")).unwrap_or(json!({}))
                          }));
                     }
                 }
                 serde_json::Value::Array(parts)
             } else {
                 content
             }
        } else {
            content
        };

        anthropic_messages.push(AnthropicMessage {
            role: role.to_string(),
            content: final_content,
        });
    }

    (system_prompt, anthropic_messages)
}

fn convert_tools(tools: Option<Vec<serde_json::Value>>) -> Option<Vec<serde_json::Value>> {
    tools.map(|tool_list| {
        tool_list.into_iter().map(|tool| {
            if let Some(func) = tool.get("function") {
                json!({
                    "name": func.get("name"),
                    "description": func.get("description"),
                    "input_schema": func.get("parameters")
                })
            } else {
                tool
            }
        }).collect()
    })
}

struct AnthropicStream {
    inner: Pin<Box<dyn Stream<Item = reqwest::Result<bytes::Bytes>> + Send>>,
    buffer: String,
    queue: VecDeque<ProviderEvent>,
    
    // State for tool call accumulation
    current_tool_id: Option<String>,
    current_tool_name: Option<String>,
    current_tool_args: String,
    
    // State for usage
    input_tokens: i32,
    output_tokens: i32,
}

impl AnthropicStream {
    fn new(inner: Pin<Box<dyn Stream<Item = reqwest::Result<bytes::Bytes>> + Send>>) -> Self {
        Self {
            inner,
            buffer: String::new(),
            queue: VecDeque::new(),
            current_tool_id: None,
            current_tool_name: None,
            current_tool_args: String::new(),
            input_tokens: 0,
            output_tokens: 0,
        }
    }
    
    fn process_data_line(&mut self, data: &str) {
        if let Ok(event) = serde_json::from_str::<AnthropicStreamEvent>(data) {
            match event.event_type.as_str() {
                "message_start" => {
                    if let Some(usage) = event.usage {
                        if let Some(it) = usage.input_tokens {
                            self.input_tokens += it;
                        }
                    }
                }
                "content_block_start" => {
                    if let Some(block) = event.content_block {
                        if block.block_type == "tool_use" {
                            self.current_tool_id = block.id;
                            self.current_tool_name = block.name;
                            self.current_tool_args.clear();
                        }
                    }
                }
                "content_block_delta" => {
                    if let Some(delta) = event.delta {
                        if let Some(text) = delta.text {
                            self.queue.push_back(ProviderEvent::Content(text));
                        }
                        if let Some(partial) = delta.partial_json {
                            self.current_tool_args.push_str(&partial);
                        }
                    }
                }
                "content_block_stop" => {
                    if self.current_tool_id.is_some() {
                        let id = self.current_tool_id.take().unwrap_or_default();
                        let name = self.current_tool_name.take().unwrap_or_default();
                        let args_str = std::mem::take(&mut self.current_tool_args);
                        
                        let tool_call = json!({
                            "id": id,
                            "type": "function",
                            "function": {
                                "name": name,
                                "arguments": args_str // Keep as string for now? Or parse? 
                                // OpenAI expects string arguments if using the unified format to pass to providers.
                                // But `ProviderEvent::ToolCall` expects `Value`.
                                // In `orchestrator.rs`: `args = serde_json::from_str(args_str)`
                                // Wait, if I pass a JSON object in `ToolCall`, the orchestrator expects that.
                                // Let's look at `orchestrator.rs`:
                                // `args_str = function.get("arguments").as_str()`
                                // So orchestrator expects `arguments` to be a string inside the Value.
                                // So I should leave it as string.
                            }
                        });
                        self.queue.push_back(ProviderEvent::ToolCall(tool_call));
                    }
                }
                "message_delta" => {
                    if let Some(usage) = event.usage {
                        if let Some(ot) = usage.output_tokens {
                            self.output_tokens += ot;
                        }
                    }
                }
                "message_stop" => {
                     self.queue.push_back(ProviderEvent::Usage(Usage {
                         prompt_tokens: Some(self.input_tokens),
                         completion_tokens: Some(self.output_tokens),
                         total_tokens: Some(self.input_tokens + self.output_tokens),
                     }));
                     // We don't need to emit Done explicitly as stream end implicitly does it, but we could.
                }
                _ => {}
            }
        }
    }
}

impl Stream for AnthropicStream {
    type Item = ProviderEvent;
    
     fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        if let Some(event) = self.queue.pop_front() {
            return Poll::Ready(Some(event));
        }

         loop {
            match self.inner.as_mut().poll_next(cx) {
                Poll::Ready(Some(Ok(bytes))) => {
                    let s = String::from_utf8_lossy(&bytes);
                    self.buffer.push_str(&s);

                    let mut processed = false;
                    while let Some(pos) = self.buffer.find('\n') {
                        let line = self.buffer[..pos].trim().to_string();
                        self.buffer = self.buffer[pos+1..].to_string();
                        
                        if line.starts_with("data: ") {
                            let data = &line[6..];
                            self.process_data_line(data);
                            processed = true;
                        }
                    }
                    
                    if processed && !self.queue.is_empty() {
                         return Poll::Ready(Some(self.queue.pop_front().unwrap()));
                    }
                }
                Poll::Ready(Some(Err(e))) => {
                    return Poll::Ready(Some(ProviderEvent::Error(e.to_string())));
                }
                Poll::Ready(None) => {
                    return Poll::Ready(None);
                }
                Poll::Pending => return Poll::Pending,
            }
        }
    }
}
