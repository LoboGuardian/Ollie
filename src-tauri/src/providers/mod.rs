use serde::{Deserialize, Serialize};

pub mod ollama;
pub mod openai;
pub mod anthropic;
pub mod google;

/// Supported LLM providers
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProviderType {
    Ollama,
    OpenAI,
    Anthropic,
    Google,
    Other, // For OpenAI-compatible APIs (GroqCloud, OpenRouter, etc.)
}

impl Default for ProviderType {
    fn default() -> Self {
        ProviderType::Ollama
    }
}

/// Configuration for a provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub provider_type: ProviderType,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub enabled: bool,
}

impl ProviderConfig {
    pub fn ollama_default() -> Self {
        Self {
            id: "ollama-default".to_string(),
            name: "Ollama (Local)".to_string(),
            provider_type: ProviderType::Ollama,
            api_key: None,
            base_url: Some("http://localhost:11434".to_string()),
            enabled: true,
        }
    }

    pub fn get_base_url(&self) -> String {
        match self.provider_type {
            ProviderType::Ollama => {
                self.base_url.clone().unwrap_or_else(|| "http://localhost:11434".to_string())
            }
            ProviderType::OpenAI => {
                self.base_url.clone().unwrap_or_else(|| "https://api.openai.com".to_string())
            }
            ProviderType::Anthropic => {
                self.base_url.clone().unwrap_or_else(|| "https://api.anthropic.com".to_string())
            }
            ProviderType::Google => {
                self.base_url.clone().unwrap_or_else(|| "https://generativelanguage.googleapis.com".to_string())
            }
            ProviderType::Other => {
                // Other providers require a base_url to be set
                self.base_url.clone().unwrap_or_else(|| "https://api.example.com".to_string())
            }
        }
    }
}

/// Unified message format across providers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub images: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatOptions {
    pub temperature: Option<f64>,
    pub top_k: Option<i32>,
    pub top_p: Option<f64>,
    pub max_tokens: Option<i32>,
}

pub mod traits;
pub mod orchestrator; // Pre-emptively adding this as next step
