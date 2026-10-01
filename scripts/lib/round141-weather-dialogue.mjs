const definitions = [
 ['weather.clear', 'clear', '晴朗', '能看清渡口踏痕和松影。晴朗不免除冰溪碰撞，仍沿主径过桥，别从溪心抄近。', 0],
 ['weather.cloudy', 'cloudy', '多云', '云影压住远处的界标，近处主径仍可辨。认准东口与渡口踏痕，不拿云影当岔路。', 0],
 ['weather.overcast', 'overcast', '阴沉', '天色发暗，界标在松林后更难认。先沿主径辨渡口，北岔风口不是通往照雪关的东口。', 0],
 ['weather.drizzle', 'drizzle', '细雨', '雨水沾湿旧踏痕，行路要慢些。碑阳刻文仍在谷西，天气提示不会替你拓文。', 1],
 ['weather.rain', 'rain', '降雨', '溪边雨重，切勿离开踏痕抄近。出谷仍走东口，备好余时再向照雪关赶路。', 2],
 ['weather.storm', 'storm', '骤雨', '骤雨遮住远处松林，赶路尤其费时。沿已有主径和渡口走，东口回照雪关，北岔通风口。', 3],
 ['weather.snow', 'snow', '落雪', '雪会盖住旧踏痕，行走额外费时；需要落雪的调查等到此时才可能开放，仍须核对时段和见闻。', 2],
 ['weather.mist', 'mist', '轻雾', '雾里不要把近处松影当谷口。沿主径回东口可到照雪关，绕北岔只会进风口。', 1],
];
export function addWeatherPatrol(conversation) {
 if (conversation.id !== 'dlg.r93-liu-xunjing-rounds') return conversation;
 const talk = conversation;
 const greet = talk.nodes.find(n => n.id === talk.startNodeId);
 if (!greet?.options) throw Error('首节点选项不存在');
for (const [weatherId, suffix, name, note, minutes] of definitions) {
 const id = `r141-weather-${suffix}`;
 const node = {id, text: `柳寻径看了看谷口：「眼下霜松谷${name}。${note}这里每次成功行走${minutes ? `另加${minutes}世界分钟` : '没有天气额外耗时'}；关口费用与行旅时长另算，不用这段话当成补给或通行奖励。」`};
 const option = {text: '按眼下天候，巡路有什么要留意？', nextNodeId: id, conditions: [{kind: 'weather', weatherId}]};
 const old = talk.nodes.find(n => n.id === id);
 const previous = greet.options.find(o => o.nextNodeId === id);
 if (old || previous) {
  if (JSON.stringify(old) !== JSON.stringify(node) || JSON.stringify(previous) !== JSON.stringify(option)) throw Error(`拒绝覆盖已改动${id}`);
  continue;
 }
 talk.nodes.push(node);
 const end = greet.options.findIndex(o => o.nextNodeId === 'farewell');
 greet.options.splice(end < 0 ? greet.options.length : end, 0, option);
}

 // Canonicalize only our own entries after older author steps; preserve unrelated content.
 const ownNodes = talk.nodes.filter(n => n.id.startsWith('r141-weather-'));
 talk.nodes = [...talk.nodes.filter(n => !n.id.startsWith('r141-weather-')), ...ownNodes];
 const ownOptions = greet.options.filter(o => o.nextNodeId.startsWith('r141-weather-'));
 greet.options = greet.options.filter(o => !o.nextNodeId.startsWith('r141-weather-'));
 const farewell = greet.options.findIndex(o => o.nextNodeId === 'farewell');
 greet.options.splice(farewell < 0 ? greet.options.length : farewell, 0, ...ownOptions);
 return talk;
}
