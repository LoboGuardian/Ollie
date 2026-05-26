use crate::mcp::McpClient;
use crate::McpClients;

#[tauri::command]
pub async fn connect_mcp_server(
    name: String,
    command: String,
    args: Vec<String>,
    clients: tauri::State<'_, McpClients>,
) -> Result<(), String> {
    let client = McpClient::connect(&command, &args).await
        .map_err(|e| format!("Failed to connect to MCP server {}: {}", name, e))?;
    clients.0.lock()
        .map_err(|_| "MCP clients lock poisoned".to_string())?
        .insert(name.clone(), client);
    println!("Connected to MCP server: {}", name);
    Ok(())
}

#[tauri::command]
pub async fn connect_mcp_http(
    name: String,
    url: String,
    auth_token: Option<String>,
    clients: tauri::State<'_, McpClients>,
) -> Result<String, String> {
    let client = McpClient::connect_http(&url, auth_token).await
        .map_err(|e| e.to_string())?;
    clients.0.lock()
        .map_err(|_| "MCP clients lock poisoned".to_string())?
        .insert(name.clone(), client);
    Ok(format!("Connected to {}", name))
}

#[tauri::command]
pub fn list_mcp_servers(clients: tauri::State<'_, McpClients>) -> Vec<String> {
    clients.0.lock()
        .map(|map| map.keys().cloned().collect())
        .unwrap_or_default()
}

#[derive(serde::Serialize)]
pub struct ToolInfo {
    pub server: String,
    pub name: String,
    pub description: Option<String>,
    pub schema: serde_json::Value,
}

#[tauri::command]
pub async fn list_tools(clients: tauri::State<'_, McpClients>) -> Result<Vec<ToolInfo>, String> {
    let names: Vec<String> = clients.0.lock()
        .map(|map| map.keys().cloned().collect())
        .unwrap_or_default();

    let client_refs: Vec<(String, std::sync::Arc<McpClient>)> = {
        let map = clients.0.lock()
            .map_err(|_| "MCP clients lock poisoned".to_string())?;
        names.iter()
            .filter_map(|n| map.get(n).map(|c| (n.clone(), c.clone())))
            .collect()
    };

    let mut all_tools = Vec::new();
    for (name, client) in client_refs {
        match client.list_tools().await {
            Ok(tools) => {
                for tool in tools {
                    all_tools.push(ToolInfo {
                        server: name.clone(),
                        name: tool.name,
                        description: tool.description,
                        schema: tool.input_schema,
                    });
                }
            }
            Err(e) => {
                eprintln!("Failed to list tools for {}: {}", name, e);
            }
        }
    }
    Ok(all_tools)
}
