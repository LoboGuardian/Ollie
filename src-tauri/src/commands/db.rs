use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::db::{get_pool, touch_chat_updated};
use sqlx::FromRow;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ChatMeta {
	pub id: String,
	pub created_at: i64,
	pub updated_at: i64,
	pub model: Option<String>,
	pub system_prompt: Option<String>,
	pub params_json: Option<String>,
	pub title: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct MessageRow {
	pub id: String,
	pub chat_id: String,
	pub role: String,
	pub content: String,
	pub created_at: i64,
	pub meta_json: Option<String>,
}

#[tauri::command]
pub async fn db_create_chat(model: Option<String>, system_prompt: Option<String>, params_json: Option<String>) -> Result<ChatMeta, String> {
	let pool = get_pool().await?;
	let id = Uuid::new_v4().to_string();
	let now = chrono::Utc::now().timestamp_millis();
	let title: Option<String> = None;
	sqlx::query("INSERT INTO chats (id, created_at, updated_at, model, system_prompt, params_json, title) VALUES (?,?,?,?,?,?,?)")
		.bind(&id)
		.bind(now)
		.bind(now)
		.bind(&model)
		.bind(&system_prompt)
		.bind(&params_json)
		.bind(&title)
		.execute(&pool)
		.await
		.map_err(|e| format!("create chat failed: {}", e))?;
	Ok(ChatMeta { id, created_at: now, updated_at: now, model, system_prompt, params_json, title })
}

#[tauri::command]
pub async fn db_append_message(chat_id: String, role: String, content: String, meta_json: Option<String>) -> Result<MessageRow, String> {
	let pool = get_pool().await?;
	let id = Uuid::new_v4().to_string();
	let now = chrono::Utc::now().timestamp_millis();
	sqlx::query("INSERT INTO messages (id, chat_id, role, content, created_at, meta_json) VALUES (?,?,?,?,?,?)")
		.bind(&id)
		.bind(&chat_id)
		.bind(&role)
		.bind(&content)
		.bind(now)
		.bind(&meta_json)
		.execute(&pool)
		.await
		.map_err(|e| format!("append message failed: {}", e))?;
	touch_chat_updated(&pool, &chat_id).await?;
	Ok(MessageRow { id, chat_id, role, content, created_at: now, meta_json })
}

#[tauri::command]
pub async fn db_set_chat_model(chat_id: String, model: String) -> Result<bool, String> {
	let pool = get_pool().await?;
	let res = sqlx::query("UPDATE chats SET model = ? WHERE id = ?")
		.bind(model)
		.bind(chat_id)
		.execute(&pool)
		.await
		.map_err(|e| format!("set chat model failed: {}", e))?;
	Ok(res.rows_affected() > 0)
}

#[tauri::command]
pub async fn db_set_chat_title(chat_id: String, title: String) -> Result<bool, String> {
	let pool = get_pool().await?;
	let res = sqlx::query("UPDATE chats SET title = ? WHERE id = ?")
		.bind(title)
		.bind(chat_id)
		.execute(&pool)
		.await
		.map_err(|e| format!("set chat title failed: {}", e))?;
	Ok(res.rows_affected() > 0)
}

#[tauri::command]
pub async fn db_set_chat_system_prompt(chat_id: String, system_prompt: Option<String>) -> Result<bool, String> {
	let pool = get_pool().await?;
	let res = sqlx::query("UPDATE chats SET system_prompt = ? WHERE id = ?")
		.bind(system_prompt)
		.bind(chat_id)
		.execute(&pool)
		.await
		.map_err(|e| format!("set chat system prompt failed: {}", e))?;
	Ok(res.rows_affected() > 0)
}

#[tauri::command]
pub async fn db_list_chats(limit: Option<i64>) -> Result<Vec<ChatMeta>, String> {
	let pool = get_pool().await?;
	let l = limit.unwrap_or(100);
	let rows = sqlx::query_as::<_, ChatMeta>(
		"SELECT id, created_at, updated_at, model, system_prompt, params_json, title FROM chats ORDER BY updated_at DESC LIMIT ?"
	)
	.bind(l)
	.fetch_all(&pool)
	.await
	.map_err(|e| format!("list chats failed: {}", e))?;
	Ok(rows)
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ChatWithFlags {
	pub id: String,
	pub created_at: i64,
	pub updated_at: i64,
	pub model: Option<String>,
	pub system_prompt: Option<String>,
	pub params_json: Option<String>,
	pub title: Option<String>,
	pub has_messages: bool,
}

#[tauri::command]
pub async fn db_list_chats_with_flags(limit: Option<i64>) -> Result<Vec<ChatWithFlags>, String> {
	let pool = get_pool().await?;
	let l = limit.unwrap_or(100);
	let rows = sqlx::query_as::<_, ChatWithFlags>(
		r#"SELECT c.id, c.created_at, c.updated_at, c.model, c.system_prompt, c.params_json, c.title,
		   EXISTS(SELECT 1 FROM messages m WHERE m.chat_id = c.id LIMIT 1) AS has_messages
		   FROM chats c ORDER BY c.updated_at DESC LIMIT ?"#
	)
	.bind(l)
	.fetch_all(&pool)
	.await
	.map_err(|e| format!("list chats with flags failed: {}", e))?;
	Ok(rows)
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ChatWithPreview {
	pub id: String,
	pub created_at: i64,
	pub updated_at: i64,
	pub model: Option<String>,
	pub system_prompt: Option<String>,
	pub params_json: Option<String>,
	pub title: Option<String>,
	pub first_message: Option<String>,
}

#[tauri::command]
pub async fn db_list_chats_with_preview(limit: Option<i64>) -> Result<Vec<ChatWithPreview>, String> {
	let pool = get_pool().await?;
	let l = limit.unwrap_or(200);
	let rows = sqlx::query_as::<_, ChatWithPreview>(
		r#"SELECT c.id, c.created_at, c.updated_at, c.model, c.system_prompt, c.params_json, c.title,
		   (SELECT content FROM messages WHERE chat_id = c.id ORDER BY created_at ASC LIMIT 1) AS first_message
		   FROM chats c ORDER BY c.updated_at DESC LIMIT ?"#
	)
	.bind(l)
	.fetch_all(&pool)
	.await
	.map_err(|e| format!("list chats with preview failed: {}", e))?;
	Ok(rows)
}

#[tauri::command]
pub async fn db_list_messages(chat_id: String, limit: Option<i64>) -> Result<Vec<MessageRow>, String> {
	let pool = get_pool().await?;
	let l = limit.unwrap_or(500);
	let rows = sqlx::query_as::<_, MessageRow>(
		"SELECT id, chat_id, role, content, created_at, meta_json FROM messages WHERE chat_id = ? ORDER BY created_at ASC LIMIT ?"
	)
	.bind(chat_id)
	.bind(l)
	.fetch_all(&pool)
	.await
	.map_err(|e| format!("list messages failed: {}", e))?;
	Ok(rows)
}

#[tauri::command]
pub async fn db_delete_chat(chat_id: String) -> Result<bool, String> {
	let pool = get_pool().await?;
	let res = sqlx::query("DELETE FROM chats WHERE id = ?")
		.bind(chat_id)
		.execute(&pool)
		.await
		.map_err(|e| format!("delete chat failed: {}", e))?;
	Ok(res.rows_affected() > 0)
}

#[tauri::command]
pub async fn db_update_message(id: String, content: String) -> Result<bool, String> {
	let pool = get_pool().await?;
	let res = sqlx::query("UPDATE messages SET content = ? WHERE id = ?")
		.bind(content)
		.bind(id)
		.execute(&pool)
		.await
		.map_err(|e| format!("update message failed: {}", e))?;
	Ok(res.rows_affected() > 0)
}

#[tauri::command]
pub async fn db_delete_messages_after(chat_id: String, timestamp: i64) -> Result<u64, String> {
	let pool = get_pool().await?;
	let res = sqlx::query("DELETE FROM messages WHERE chat_id = ? AND created_at > ?")
		.bind(chat_id)
		.bind(timestamp)
		.execute(&pool)
		.await
		.map_err(|e| format!("delete messages after failed: {}", e))?;
	Ok(res.rows_affected())
}