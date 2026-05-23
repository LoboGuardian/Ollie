use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use crate::providers::ProviderConfig;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DefaultParams {
    pub temperature: Option<f64>,
    pub top_k: Option<i32>,
    pub top_p: Option<f64>,
    pub max_tokens: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Settings {
    pub server_url: String,
    pub default_model: Option<String>,
    pub default_params: Option<DefaultParams>,
    pub theme: Option<String>,
    #[serde(default)]
    pub providers: Vec<ProviderConfig>,
    #[serde(default)]
    pub active_provider_id: Option<String>,
    /// Application mode: "local" (Ollama) or "cloud" (API providers)
    #[serde(default = "default_app_mode")]
    pub app_mode: String,
    /// Whether initial setup wizard has been completed
    #[serde(default)]
    pub setup_completed: bool,
}

fn default_app_mode() -> String {
    "local".to_string()
}


fn config_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|e| format!("Cannot read HOME: {}", e))?;
    let dir = PathBuf::from(home).join(".config").join("ollie");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create config dir: {}", e))?;
    }
    Ok(dir)
}

fn settings_path() -> Result<PathBuf, String> { Ok(config_dir()?.join("settings.json")) }

/// Get the configured Ollama server URL (for use by other modules)
pub fn get_ollama_url() -> String {
    let path = match settings_path() {
        Ok(p) => p,
        Err(_) => return "http://localhost:11434".to_string(),
    };
    
    if !path.exists() {
        return "http://localhost:11434".to_string();
    }
    
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return "http://localhost:11434".to_string(),
    };
    
    let settings: Settings = match serde_json::from_str(&content) {
        Ok(s) => s,
        Err(_) => return "http://localhost:11434".to_string(),
    };
    
    if settings.server_url.is_empty() {
        "http://localhost:11434".to_string()
    } else {
        settings.server_url
    }
}

fn default_providers() -> Vec<ProviderConfig> {
    vec![ProviderConfig::ollama_default()]
}

#[tauri::command]
pub async fn settings_get() -> Result<Settings, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(Settings {
            server_url: "http://localhost:11434".to_string(),
            default_model: None,
            default_params: None,
            theme: Some("light".to_string()),
            providers: default_providers(),
            active_provider_id: Some("ollama-default".to_string()),
            app_mode: "local".to_string(),
            setup_completed: false,
        });

    }
    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read settings: {}", e))?;
    let mut settings: Settings = serde_json::from_str(&content).map_err(|e| format!("Invalid settings JSON: {}", e))?;
    
    // Ensure default providers exist
    if settings.providers.is_empty() {
        settings.providers = default_providers();
        settings.active_provider_id = Some("ollama-default".to_string());
    }
    
    Ok(settings)
}

#[tauri::command]
pub async fn settings_set(settings: Settings) -> Result<Settings, String> {
    let path = settings_path()?;
    let content = serde_json::to_string_pretty(&settings).map_err(|e| format!("Serialize settings failed: {}", e))?;
    // Write atomically: temp file in same dir + rename to avoid corrupt JSON on crash
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, &content).map_err(|e| format!("Failed to write settings tmp: {}", e))?;
    fs::rename(&tmp_path, &path).map_err(|e| format!("Failed to finalize settings: {}", e))?;
    Ok(settings)
}

#[tauri::command]
pub async fn provider_add(config: ProviderConfig) -> Result<Vec<ProviderConfig>, String> {
    let mut settings = settings_get().await?;
    
    // Check for duplicate ID
    if settings.providers.iter().any(|p| p.id == config.id) {
        return Err(format!("Provider with ID '{}' already exists", config.id));
    }
    
    settings.providers.push(config);
    settings_set(settings.clone()).await?;
    Ok(settings.providers)
}

#[tauri::command]
pub async fn provider_update(config: ProviderConfig) -> Result<Vec<ProviderConfig>, String> {
    let mut settings = settings_get().await?;
    
    if let Some(pos) = settings.providers.iter().position(|p| p.id == config.id) {
        settings.providers[pos] = config;
        settings_set(settings.clone()).await?;
        Ok(settings.providers)
    } else {
        Err(format!("Provider with ID '{}' not found", config.id))
    }
}

#[tauri::command]
pub async fn provider_delete(id: String) -> Result<Vec<ProviderConfig>, String> {
    let mut settings = settings_get().await?;
    
    // Prevent deleting the default Ollama provider
    if id == "ollama-default" {
        return Err("Cannot delete the default Ollama provider".to_string());
    }
    
    settings.providers.retain(|p| p.id != id);
    
    // Reset active provider if deleted
    if settings.active_provider_id == Some(id.clone()) {
        settings.active_provider_id = Some("ollama-default".to_string());
    }
    
    settings_set(settings.clone()).await?;
    Ok(settings.providers)
}

#[tauri::command]
pub async fn provider_set_active(id: String) -> Result<Settings, String> {
    let mut settings = settings_get().await?;
    
    if !settings.providers.iter().any(|p| p.id == id) {
        return Err(format!("Provider with ID '{}' not found", id));
    }
    
    settings.active_provider_id = Some(id);
    settings_set(settings).await
}

#[tauri::command]
pub async fn provider_list() -> Result<Vec<ProviderConfig>, String> {
    let settings = settings_get().await?;
    Ok(settings.providers)
}

#[tauri::command]
pub async fn provider_get_active() -> Result<ProviderConfig, String> {
    let settings = settings_get().await?;
    let active_id = settings.active_provider_id.unwrap_or_else(|| "ollama-default".to_string());
    
    settings.providers.into_iter()
        .find(|p| p.id == active_id)
        .ok_or_else(|| "Active provider not found".to_string())
}
