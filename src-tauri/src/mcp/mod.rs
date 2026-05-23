use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::time::Duration;
use anyhow::Result;
use serde_json::Value;
use crate::mcp::protocol::{JsonRpcRequest, JsonRpcResponse, Tool, ListToolsResult, CallToolRequest, CallToolResult};
use crate::mcp::transport::{Transport, StdioTransport, SseTransport};
use lazy_static::lazy_static;
use tokio::sync::Mutex as TokioMutex;

pub mod protocol;
pub mod transport;

lazy_static! {
    static ref ACTIVE_MCP_CLIENTS: Arc<Mutex<HashMap<String, Arc<McpClient>>>> = Arc::new(Mutex::new(HashMap::new()));
}

pub struct McpClient {
    transport: Arc<TokioMutex<Transport>>,
    next_id: Arc<Mutex<u64>>,
}

impl McpClient {
    pub async fn connect(name: &str, command: &str, args: &[String]) -> Result<Arc<Self>> {
        let transport = StdioTransport::new(command, args)?;
        
        let client = Arc::new(Self {
            transport: Arc::new(TokioMutex::new(Transport::Stdio(transport))),
            next_id: Arc::new(Mutex::new(1)),
        });

        Self::initialize(&client).await?;

        // Register in global map
        {
            if let Ok(mut clients) = ACTIVE_MCP_CLIENTS.lock() {
                clients.insert(name.to_string(), client.clone());
            }
        }

        Ok(client)
    }

    pub async fn connect_http(name: &str, url: &str, auth_token: Option<String>) -> Result<Arc<Self>> {
        let transport = SseTransport::new(url, auth_token)?;

        let client = Arc::new(Self {
            transport: Arc::new(TokioMutex::new(Transport::Sse(transport))),
            next_id: Arc::new(Mutex::new(1)),
        });

        Self::initialize(&client).await?;

        // Register in global map
        {
            if let Ok(mut clients) = ACTIVE_MCP_CLIENTS.lock() {
                clients.insert(name.to_string(), client.clone());
            }
        }

        Ok(client)
    }

    async fn initialize(client: &Arc<Self>) -> Result<()> {
        let init_params = serde_json::to_value(crate::mcp::protocol::InitializeParams {
            protocol_version: "2024-11-05".to_string(),
            capabilities: crate::mcp::protocol::ClientCapabilities {
                roots: Some(crate::mcp::protocol::RootsCapability { list_changed: Some(false) }),
                sampling: Some(serde_json::json!({})),
            },
            client_info: crate::mcp::protocol::ClientInfo {
                name: "Ollie".to_string(),
                version: "0.2.1".to_string(),
            },
        })?;

        let _init_result: Value = client.send_request("initialize", Some(init_params)).await?;
        client.send_notification("notifications/initialized", None).await?;
        Ok(())
    }

    pub fn get_client(name: &str) -> Option<Arc<McpClient>> {
        ACTIVE_MCP_CLIENTS.lock().ok()?.get(name).cloned()
    }

    pub fn list_active_clients() -> Vec<String> {
        ACTIVE_MCP_CLIENTS.lock().ok()
            .map(|clients| clients.keys().cloned().collect())
            .unwrap_or_default()
    }

    async fn send_request(&self, method: &str, params: Option<Value>) -> Result<Value> {
        let id = {
            let mut id_lock = self.next_id.lock()
                .map_err(|_| anyhow::anyhow!("Failed to acquire lock"))?;
            let id = *id_lock;
            *id_lock += 1;
            id
        };

        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(id),
            method: method.to_string(),
            params,
        };

        {
            let mut transport = self.transport.lock().await;
            let req_value = serde_json::to_value(&request)?;
            transport.send(req_value).await?;
        }

        let response_fut = async {
            loop {
                let response_value = {
                    let mut transport = self.transport.lock().await;
                    transport.receive().await?
                };

                if let Some(val) = response_value {
                    if let Ok(resp) = serde_json::from_value::<JsonRpcResponse>(val.clone()) {
                        if resp.id == Some(id) {
                            if let Some(error) = resp.error {
                                return Err(anyhow::anyhow!("RPC Error {}: {}", error.code, error.message));
                            }
                            return Ok(resp.result.unwrap_or(Value::Null));
                        }
                    }
                } else {
                    return Err(anyhow::anyhow!("Connection closed"));
                }
            }
        };

        tokio::time::timeout(Duration::from_secs(30), response_fut)
            .await
            .map_err(|_| anyhow::anyhow!("MCP request timed out after 30s (method: {})", method))?
    }

    async fn send_notification(&self, method: &str, params: Option<Value>) -> Result<()> {
        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: None,
            method: method.to_string(),
            params,
        };

        let mut transport = self.transport.lock().await;
        let req_value = serde_json::to_value(&request)?;
        transport.send(req_value).await?;
        Ok(())
    }

    pub async fn list_tools(&self) -> Result<Vec<Tool>> {
        let result = self.send_request("tools/list", None).await?;
        let tools_result: ListToolsResult = serde_json::from_value(result)?;
        Ok(tools_result.tools)
    }

    pub async fn call_tool(&self, name: &str, arguments: Value) -> Result<CallToolResult> {
        let params = serde_json::to_value(CallToolRequest {
            name: name.to_string(),
            arguments,
        })?;
        
        let result = self.send_request("tools/call", Some(params)).await?;
        let call_result: CallToolResult = serde_json::from_value(result)?;
        Ok(call_result)
    }
}
