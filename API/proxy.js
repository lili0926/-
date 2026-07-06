// 在fetch请求前增加判断
let requestBody;
if(aiApiConfig.baseUrl.includes("anthropic")){
  // Claude专用请求体
  requestBody = {
    model: aiApiConfig.model,
    max_tokens: 1024,
    messages: messages
  }
  headers["x-api-key"] = aiApiConfig.key;
  delete headers.Authorization;
}else{
  // 通用OpenAI格式（DeepSeek/GLM/Grok）
  requestBody = {
    model: aiApiConfig.model,
    messages: messages,
    temperature: 0.7
  }
  headers.Authorization = `Bearer ${aiApiConfig.key}`;
}
