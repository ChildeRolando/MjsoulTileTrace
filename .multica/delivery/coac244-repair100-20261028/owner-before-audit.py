from pathlib import Path
p=Path('short-stage-owner-prefix.md')
text=p.read_text(encoding='utf-8')
prefix='''100限定条件修订（本轮授权01a17f4b-adc5-76d9-bd04-78a849727fe9）：canonical nemata-jp-chapter-100-1，仅modern-yabejp-ja:chapter01-section035:b0041，源b0038「生きている（２枚以上切れてない）孤立字牌」、b0041「役牌トイツ１組＋生きている字牌２〜３種」。批准唯一替换“1组役牌对子＋仍有剩余的字牌2～3种”→“1组役牌对子＋2～3种仍然有效（尚未被打出2张以上）的字牌”。既有真实c821f2f0独审67faithful/1error与原243passed按明示补证合并，原旧uncertain/raw不改；原3组顺序证据分别继承，旧aggregate DOM false不直接覆写。真正输出仅1块；生产与独审实际请求均保留107块含39A/B定义及条件，纯文sol/high、images=[]；310其它块/128图内容/字段不变。预算1maker+1仅条件独审=2，失败void计、0retry。第一次request-only标志因旧option解析无值提前执行授权maker0bc838f2（15.36秒）而非零调用预检；该错误显式计1/2、原v1快照/raw保留，v2/v3入口已修boolean开关并要求显式execute，未重复制作。当前候选0415bd3c…已逐字段/实际raw验真；新v3 manifest f21b00fe…，14项零调用实际请求/白名单/继承拒绝测试。独审前补记于现有owner，成功交250、不切正式active，不涉及159/242。

'''
p.write_text(prefix+text,encoding='utf-8')
