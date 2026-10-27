const overlay=new URL('./test-overlay.mjs',import.meta.url).href;
export async function resolve(specifier,context,next){
 if(specifier==='node:fs/promises'&&context.parentURL!==overlay)return {url:overlay,shortCircuit:true};
 return next(specifier,context);
}
