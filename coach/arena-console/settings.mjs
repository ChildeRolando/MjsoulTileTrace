import {api,$,message} from '/client.mjs';
const form=$('#settings-form');
function providerFields(){const mode=form.elements.provider.value==='openai-compatible';$('#api-fields').hidden=!mode;$('#effort-field').hidden=mode;$('#subscription-note').hidden=mode;}
async function load(){try{const state=await api('/api/state');for(const [key,value]of Object.entries(state.config))if(form.elements.namedItem(key))form.elements.namedItem(key).value=value;form.dataset.clearKey='false';$('#key-status').textContent=state.config.keyConfigured?'本次服务进程已配置密钥':'尚未配置密钥';providerFields();$('#sync-status').textContent='';}catch(e){message(e.message,true);}}
form.elements.provider.addEventListener('change',providerFields);
$('#clear-key').addEventListener('click',()=>{form.dataset.clearKey='true';form.elements.apiKey.value='';$('#key-status').textContent='保存后清除当前密钥';});
form.addEventListener('submit',async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(form));for(const key of ['tokenWarningThreshold','maxRunMs','maxProviderTurns','maxToolCalls','maxProviderOutputTokens'])data[key]=Number(data[key]);data.clearApiKey=form.dataset.clearKey==='true';const button=form.querySelector('[type=submit]');button.disabled=true;$('#settings-error').hidden=true;try{await api('/api/config',data);form.elements.apiKey.value='';await load();message('配置已保存，用于下一次实验。');}catch(e){$('#settings-error').textContent=e.message;$('#settings-error').hidden=false;$('#settings-error').tabIndex=-1;$('#settings-error').focus();}finally{button.disabled=false;}});
await load();
