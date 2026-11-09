-- 支持自定义 OpenAI 兼容 Base URL（火山方舟、Qwen、Ollama 等）
ALTER TABLE `LlmModel` ADD COLUMN `baseUrl` VARCHAR(512) NULL;
