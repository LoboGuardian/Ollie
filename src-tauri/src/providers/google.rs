//! Google Gemini API provider

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

#[derive(Debug, Serialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<GeminiTool>>,
    #[serde(rename = "generationConfig", skip_serializing_if = "Option::is_none")]
    generation_config: Option<GeminiGenerationConfig>,
    #[serde(rename = "systemInstruction", skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GeminiContent>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
enum GeminiPart {
    Text { text: String },
    InlineData { 
        #[serde(rename = "inlineData")]
        inline_data: GeminiInlineData 
    },
    FunctionCall {
        #[serde(rename = "functionCall")]
        function_call: GeminiFunctionCall,
    },
    FunctionResponse {
        #[serde(rename = "functionResponse")]
        function_response: GeminiFunctionResponse,
    },
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiInlineData {
    #[serde(rename = "mimeType")]
    mime_type: String,
    data: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiFunctionCall {
    name: String,
    args: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiFunctionResponse {
    name: String,
    response: serde_json::Value,
}

#[derive(Debug, Serialize)]
struct GeminiTool {
    #[serde(rename = "functionDeclarations")]
    function_declarations: Vec<GeminiFunctionDeclaration>,
}

#[derive(Debug, Serialize)]
struct GeminiFunctionDeclaration {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

#[derive(Debug, Serialize)]
struct GeminiGenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f64>,
    #[serde(rename = "maxOutputTokens", skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct GeminiStreamResponse {
    candidates: Option<Vec<GeminiCandidate>>,
    #[serde(rename = "usageMetadata")]
    usage_metadata: Option<GeminiUsage>,
}

#[derive(Debug, Deserialize)]
struct GeminiCandidate {
    content: Option<GeminiContent>,
    #[serde(rename = "finishReason")]
    #[allow(dead_code)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GeminiUsage {
    #[serde(rename = "promptTokenCount")]
    prompt_token_count: Option<i32>,
    #[serde(rename = "candidatesTokenCount")]
    candidates_token_count: Option<i32>,
    #[serde(rename = "totalTokenCount")]
    total_token_count: Option<i32>,
}

pub struct GoogleProvider;

#[async_trait]
impl LLMProvider for GoogleProvider {
    async fn stream_chat(
        &self,
        config: &ProviderConfig,
        model: &str,
        messages: &[ChatMessage],
        tools: Option<Vec<serde_json::Value>>,
        options: Option<ChatOptions>,
    ) -> anyhow::Result<BoxStream<'static, ProviderEvent>> {
        let api_key = config.api_key.as_ref()
            .ok_or_else(|| anyhow::anyhow!("Google API key is required"))?;

        let base_url = config.get_base_url();
        let endpoint = format!(
            "{}/v1beta/models/{}:streamGenerateContent?alt=sse",
            base_url, model
        );

        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(
            "x-goog-api-key",
            HeaderValue::from_str(api_key).map_err(|_| anyhow::anyhow!("Invalid API key"))?,
        );

        let (system_instruction, gemini_contents) = convert_messages(messages);

        let mut request_body = GeminiRequest {
            contents: gemini_contents,
            tools: convert_tools(tools),
            generation_config: None,
            system_instruction,
        };
        
        if let Some(opts) = options {
            request_body.generation_config = Some(GeminiGenerationConfig {
                temperature: opts.temperature,
                max_output_tokens: opts.max_tokens,
            });
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
            return Err(anyhow::anyhow!("Gemini API error {}: {}", status, error_text));
        }

        let stream = response.bytes_stream();
        Ok(Box::pin(GeminiStream::new(Box::pin(stream))))
    }
}

fn convert_messages(messages: &[ChatMessage]) -> (Option<GeminiContent>, Vec<GeminiContent>) {
    let mut system_instruction = None;
    let mut gemini_contents = Vec::new();

    for msg in messages {
        if msg.role == "system" {
            system_instruction = Some(GeminiContent {
                role: "user".to_string(), // System instructions in Gemini are separate, but fallback to user if not supported? 
                // Actually `system_instruction` field is supported in v1beta.
                parts: vec![GeminiPart::Text { text: msg.content.clone() }],
            });
            continue;
        }

        let role = match msg.role.as_str() {
            "user" => "user",
            "assistant" => "model",
            "tool" => "function",
            _ => "user",
        };

        // Handle tool results
        if msg.role == "tool" {
            gemini_contents.push(GeminiContent {
                role: "function".to_string(),
                parts: vec![GeminiPart::FunctionResponse {
                    function_response: GeminiFunctionResponse {
                        name: msg.tool_call_id.clone().unwrap_or_default(),
                        response: json!({ "result": msg.content }),
                    }
                }],
            });
            continue;
        }

        let mut parts = vec![GeminiPart::Text { text: msg.content.clone() }];

        if let Some(images) = &msg.images {
             for image in images {
                parts.push(GeminiPart::InlineData {
                    inline_data: GeminiInlineData {
                        mime_type: "image/jpeg".to_string(),
                        data: image.clone(),
                    }
                });
            }
        }
        
        // Handle assistant tool calls in history
        if let Some(calls) = &msg.tool_calls {
            for call in calls {
                if let Some(func) = call.get("function") {
                    let name = func.get("name").and_then(|n| n.as_str()).unwrap_or_default();
                    let args = serde_json::from_str::<serde_json::Value>(func.get("arguments").and_then(|a| a.as_str()).unwrap_or("{}")).unwrap_or(json!({}));
                    parts.push(GeminiPart::FunctionCall {
                        function_call: GeminiFunctionCall {
                            name: name.to_string(),
                            args,
                        }
                    });
                }
            }
        }

        gemini_contents.push(GeminiContent {
            role: role.to_string(),
            parts,
        });
    }

    (system_instruction, gemini_contents)
}

fn convert_tools(tools: Option<Vec<serde_json::Value>>) -> Option<Vec<GeminiTool>> {
    tools.map(|tool_list| {
        let declarations: Vec<GeminiFunctionDeclaration> = tool_list.into_iter().filter_map(|tool| {
            tool.get("function").map(|func| {
                GeminiFunctionDeclaration {
                    name: func.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string(),
                    description: func.get("description").and_then(|d| d.as_str()).unwrap_or("").to_string(),
                    parameters: func.get("parameters").cloned().unwrap_or(json!({})),
                }
            })
        }).collect();

        vec![GeminiTool { function_declarations: declarations }]
    })
}

struct GeminiStream {
    inner: Pin<Box<dyn Stream<Item = reqwest::Result<bytes::Bytes>> + Send>>,
    buffer: String,
    queue: VecDeque<ProviderEvent>,
}

impl GeminiStream {
    fn new(inner: Pin<Box<dyn Stream<Item = reqwest::Result<bytes::Bytes>> + Send>>) -> Self {
        Self { inner, buffer: String::new(), queue: VecDeque::new() }
    }
    
    fn process_data_line(&mut self, data: &str) {
        if let Ok(response) = serde_json::from_str::<GeminiStreamResponse>(data) {
             if let Some(candidates) = response.candidates {
                 if let Some(candidate) = candidates.first() {
                     if let Some(c) = &candidate.content {
                         for part in &c.parts {
                             match part {
                                 GeminiPart::Text { text } => {
                                     self.queue.push_back(ProviderEvent::Content(text.clone()));
                                 }
                                 GeminiPart::FunctionCall { function_call } => {
                                     let call = json!({
                                         "id": function_call.name.clone(), // Gemini uses name as ID implicitly? Or just name. 
                                         // Unified format expects 'id'. We can use name or generate uuid.
                                         // But history matching needs ID.
                                         // For now use name as ID.
                                         "type": "function",
                                         "function": {
                                             "name": function_call.name,
                                             "arguments": serde_json::to_string(&function_call.args).unwrap_or_default()
                                         }
                                     });
                                     self.queue.push_back(ProviderEvent::ToolCall(call));
                                 }
                                 _ => {}
                             }
                         }
                     }
                 }
             }
             
             if let Some(usage) = response.usage_metadata {
                 self.queue.push_back(ProviderEvent::Usage(Usage {
                     prompt_tokens: usage.prompt_token_count,
                     completion_tokens: usage.candidates_token_count,
                     total_tokens: usage.total_token_count,
                 }));
             }
        }
    }
}

impl Stream for GeminiStream {
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
