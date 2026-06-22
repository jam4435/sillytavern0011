// 地点修复脚本
// 规则：所有地点使用 `一级/二级/三级` 格式
// 一级：国家/大区（大宋、金国、蒙古）
// 二级：省府/山脉/湖泊
// 三级：具体场所

const fs = require('fs');
const path = require('path');

const baseDir = 'F:\\Develop\\AI\\sillytavern\\角色卡\\金庸群侠传\\世界书';

// ============= 修复规则定义 =============

// 1. 超过三级 → 只取前三级
const over3Fix = [
  // 射雕超过三级
  { file: '射雕\\事件\\第16回-06-巧遇周伯通.txt', old: '大宋/临安府/桃花岛/山洞', new: '大宋/临安府/桃花岛' },
  { file: '射雕\\事件\\第1回-05-包惜弱巧救颜烈.txt', old: '大宋/临安府/牛家村/杨家柴房', new: '大宋/临安府/牛家村' },
  { file: '射雕\\事件\\第28回-03-铁掌峰顶遇险得书.txt', old: '湖广/潭州/铁掌山/深谷', new: '大宋/潭州/铁掌山' },
  { file: '射雕\\事件\\第39回-01-济南府遇师解惑.txt', old: '金国/山东/济南府/小镇', new: '金国/山东/济南府' },
  { file: '射雕\\事件\\第9回-01-夜探王府.txt', old: '金国/中都/赵王府/铁牢', new: '金国/中都/赵王府' },
  { file: '射雕\\事件\\第9回-04-故人相认.txt', old: '金国/中都/赵王府/包惜弱旧居/板橱', new: '金国/中都/赵王府' },
  // 神雕超过三级
  { file: '神雕\\事件\\第7回-02-李莫愁见石棺知断龙石惊怒下杀手.txt', old: '大宋/终南山/活死人墓/灵室', new: '大宋/终南山/活死人墓' },
  { file: '神雕\\事件\\第7回-04-李莫愁闯入查验守宫砂蛤蟆功显威.txt', old: '大宋/终南山/活死人墓/孙婆婆房', new: '大宋/终南山/活死人墓' },
];

// 2. 不足三级 → 根据上下文补全
const under3Fix = [
  // ---- 射雕不足三级 ----
  { file: '射雕\\事件\\第13回-04-穆念慈夜闯归云庄.txt', old: '大宋/苏州', new: '大宋/苏州/荒山' },
  { file: '射雕\\事件\\第15回-07-黄蓉智斗欧阳克.txt', old: '不明', new: '大宋/宝应/刘氏宗祠' },
  { file: '射雕\\事件\\第16回-04-穆杨决裂.txt', old: '在逃', new: '大宋/临安府/牛家村' },
  { file: '射雕\\事件\\第16回-04-穆杨决裂.txt', old: '在途', new: '大宋/临安府/牛家村' },
  { file: '射雕\\事件\\第17回-06-蜡丸传信诉情意.txt', old: '桃花岛/黄药师居所', new: '大宋/临安府/桃花岛' },
  { file: '射雕\\事件\\第19回-04-怒逐东床.txt', old: '东海/花船', new: '大宋/东海/桃花岛' },
  { file: '射雕\\事件\\第19回-05-洪涛群鲨.txt', old: '桃花岛/母亲墓室', new: '大宋/临安府/桃花岛' },
  { file: '射雕\\事件\\第1回-06-牛家村风雪惊变.txt', old: '未知', new: '大宋/临安府/牛家村' },
  { file: '射雕\\事件\\第1回-06-牛家村风雪惊变.txt', old: '大金/中都', new: '金国/中都/赵王府' },
  { file: '射雕\\事件\\第20回-03-桅杆相持.txt', old: '东海/轻舟', new: '大宋/东海/桃花岛' },
  { file: '射雕\\事件\\第21回-02-舍身护师.txt', old: '东海/海底', new: '大宋/东海/桃花岛' },
  { file: '射雕\\事件\\第21回-02-舍身护师.txt', old: '东海/小舢舨', new: '大宋/东海/桃花岛' },
  { file: '射雕\\事件\\第22回-12-智斗顽童.txt', old: '待定（随周伯通等人上岸）', new: '大宋/临安府/嘉兴' },
  { file: '射雕\\事件\\第22回-12-智斗顽童.txt', old: '待定（随郭靖等人上岸）', new: '大宋/临安府/嘉兴' },
  { file: '射雕\\事件\\第22回-13-东邪西毒会.txt', old: '大宋/嘉兴（途中）', new: '大宋/临安府/嘉兴' },
  { file: '射雕\\事件\\第23回-04-翠微亭窃听.txt', old: '大宋/临安府', new: '大宋/临安府/翠微亭' },
  { file: '射雕\\事件\\第25回-08-杨康巧得帮主令.txt', old: '大宋/岳州', new: '大宋/岳州/丐帮总舵' },
  { file: '射雕\\事件\\第26回-03-林中恶斗.txt', old: '逃离中', new: '大宋/临安府/牛家村' },
  { file: '射雕\\事件\\第26回-04-郭靖守信拒婚.txt', old: '离开临安', new: '大宋/临安府/郊外' },
  { file: '射雕\\事件\\第26回-04-郭靖守信拒婚.txt', old: '返回蒙古途中', new: '蒙古/大漠/成吉思汗大营' },
  { file: '射雕\\事件\\第26回-04-郭靖守信拒婚.txt', old: '返回嘉兴途中', new: '大宋/临安府/嘉兴' },
  { file: '射雕\\事件\\第28回-03-铁掌峰顶遇险得书.txt', old: '湖广/潭州/铁掌山', new: '大宋/潭州/铁掌山' },
  { file: '射雕\\事件\\第29回-04-锦囊求医.txt', old: '桃源/黑沼外围', new: '大宋/桃源/黑沼' },
  { file: '射雕\\事件\\第29回-06-巧遇樵夫.txt', old: '桃源/峰顶', new: '大宋/桃源/山峰' },
  { file: '射雕\\事件\\第31回-04-恩怨消解.txt', old: '江湖', new: '大宋/临安府/嘉兴' },
  { file: '射雕\\事件\\第33回-01-山坳解围.txt', old: '逃离中', new: '大宋/临安府/牛家村' },
  { file: '射雕\\事件\\第33回-02-师徒反目.txt', old: '离开牛家村', new: '大宋/临安府/牛家村' },
  { file: '射雕\\事件\\第33回-02-师徒反目.txt', old: '向北逃窜', new: '大宋/临安府/牛家村' },
  { file: '射雕\\事件\\第33回-03-解惑疗伤.txt', old: '前往嘉兴途中', new: '大宋/临安府/嘉兴' },
  { file: '射雕\\事件\\第34回-04-郭靖离岛.txt', old: '东海/海上', new: '大宋/东海/桃花岛' },
  { file: '射雕\\事件\\第34回-04-郭靖离岛.txt', old: '东海/桃花岛', new: '大宋/东海/桃花岛' },
  { file: '射雕\\事件\\第36回-02-黄蓉智斗欧阳锋.txt', old: '不明', new: '大宋/临安府/牛家村' },
  { file: '射雕\\事件\\第36回-06-成吉思汗西征.txt', old: '花剌子模/撒马尔罕', new: '蒙古/花剌子模/撒马尔罕' },
  { file: '射雕\\事件\\第36回-06-成吉思汗西征.txt', old: '南下途中', new: '蒙古/大漠/成吉思汗大营' },
  { file: '射雕\\事件\\第36回-07-郭靖研读兵书.txt', old: '蒙古/斡难河畔（隐藏）', new: '蒙古/斡难河/大营' },
  { file: '射雕\\事件\\第37回-05-西毒脱困.txt', old: '花剌子模/撒麻尔罕城内', new: '蒙古/花剌子模/撒麻尔罕' },
  { file: '射雕\\事件\\第38回-07-郭靖逃离蒙古.txt', old: '大宋/南行途中', new: '大宋/临安府/牛家村' },
  { file: '射雕\\事件\\第39回-05-周伯通戏耍四恶.txt', old: '前往终南山重阳宫途中', new: '大宋/终南山/重阳宫' },
  { file: '射雕\\事件\\第39回-07-洪七公斥退裘千仞.txt', old: '下山途中', new: '大宋/华山/山脚' },
  { file: '射雕\\事件\\第3回-02-李萍大漠产子.txt', old: '未知', new: '蒙古/大漠/草原' },
  { file: '射雕\\事件\\第40回-04-侠侣定盟.txt', old: '不明', new: '大宋/华山/山巅' },
  { file: '射雕\\事件\\第40回-05-华筝传书.txt', old: '西域', new: '蒙古/西域/边城' },
  { file: '射雕\\事件\\第40回-09-兄弟重逢.txt', old: '蒙古', new: '蒙古/大漠/草原' },
  { file: '射雕\\事件\\第4回-05-荒山恶战.txt', old: '蒙古/大漠（逃亡中）', new: '蒙古/大漠/草原' },
  { file: '射雕\\事件\\第6回-06-大破联军.txt', old: '蒙古/斡难河源', new: '蒙古/斡难河/大营' },
  { file: '射雕\\事件\\第6回-07-金刀驸马.txt', old: '南下途中', new: '大宋/临安府/牛家村' },
  { file: '射雕\\事件\\第6回-07-金刀驸马.txt', old: '蒙古/斡难河源', new: '蒙古/斡难河/大营' },
  { file: '射雕\\事件\\第7回-02-初遇黄蓉.txt', old: '金国/张家口', new: '金国/张家口/酒楼' },
  { file: '射雕\\事件\\第7回-03-黑松林解围.txt', old: '金国/张家口', new: '金国/张家口/黑松林' },
  { file: '射雕\\事件\\第7回-04-比武招亲.txt', old: '金国/中都', new: '金国/中都/擂台' },

  // ---- 神雕不足三级 ----
  { file: '神雕\\事件\\第10回-07-杨过登华山遇洪七公啖蜈蚣.txt', old: '大宋/华山', new: '大宋/华山/山巅' },
  { file: '神雕\\事件\\第10回-08-洪七公大睡杨过独守三日.txt', old: '大宋/华山', new: '大宋/华山/山巅' },
  { file: '神雕\\事件\\第11回-01-洪七公现身降龙掌退五丑欧阳锋突至隔人较劲.txt', old: '大宋/华山', new: '大宋/华山/山巅' },
  { file: '神雕\\事件\\第11回-02-欧阳锋洪七公华山拳脚恶斗杨过烤山药劝食.txt', old: '大宋/华山', new: '大宋/华山/山巅' },
  { file: '神雕\\事件\\第11回-03-二老连日比武杨过劝退不成反陷内力比拼.txt', old: '大宋/华山', new: '大宋/华山/山巅' },
  { file: '神雕\\事件\\第11回-04-二老借杨过口传演武打狗棒法对蛇杖.txt', old: '大宋/华山', new: '大宋/华山/山巅' },
  { file: '神雕\\事件\\第11回-05-天下无狗被破洪七公叹服二老相抱大笑同逝.txt', old: '大宋/华山', new: '大宋/华山/山巅' },
  { file: '神雕\\事件\\第11回-06-杨过华山葬双雄救瘦马结伴南行.txt', old: '大宋/陕南', new: '大宋/陕南/小镇' },
  { file: '神雕\\事件\\第14回-09-小龙女深夜不辞而别杨过狂追寻师.txt', old: '未知', new: '大宋/大胜关/客栈' },
  { file: '神雕\\事件\\第15回-06-黄药师结交杨过传授绝艺.txt', old: '离开茅屋远去', new: '大宋/东海/海岛' },
  { file: '神雕\\事件\\第15回-08-李莫愁留帖黄药师离去程英赠袍.txt', old: '已离开荒山（放火烧了山后茅舍不知去向）', new: '大宋/东海/海岛' },
  { file: '神雕\\事件\\第15回-08-李莫愁留帖黄药师离去程英赠袍.txt', old: '已离开荒山茅舍远去', new: '大宋/东海/海岛' },
  { file: '神雕\\事件\\第16回-03-杨过见蒙古大军冯默风投军行刺.txt', old: '蒙古/蒙古军营', new: '蒙古/大漠/蒙古军营' },
  { file: '神雕\\事件\\第16回-08-金轮法王引杨过见忽必烈.txt', old: '蒙古/忽必烈王帐', new: '蒙古/大漠/忽必烈王帐' },
  { file: '神雕\\事件\\第16回-09-忽必烈大宴筷子争肉斗五高手.txt', old: '蒙古/忽必烈王帐', new: '蒙古/大漠/忽必烈王帐' },
  { file: '神雕\\事件\\第16回-10-周伯通闯帐夺牛肉戏弄众人.txt', old: '蒙古/忽必烈王帐', new: '蒙古/大漠/忽必烈王帐' },
  { file: '神雕\\事件\\第16回-11-周伯通与杨过交谈中毒酒塌帐.txt', old: '蒙古/忽必烈王帐', new: '蒙古/大漠/忽必烈王帐' },
  { file: '神雕\\事件\\第16回-13-六人追踪入绝情谷.txt', old: '大宋/绝情谷', new: '大宋/绝情谷/水仙山庄' },
  { file: '神雕\\事件\\第17回-07-周伯通渔网围困脱衣证清白调包脱逃.txt', old: '已离开绝情谷', new: '大宋/绝情谷/水仙山庄' },
  { file: '神雕\\事件\\第1回-07-李莫愁血洗陆家庄.txt', old: '大宋/嘉兴', new: '大宋/嘉兴府/陆家庄' },
  { file: '神雕\\事件\\第22回-09-李莫愁抢女婴三人出城追逐.txt', old: '大宋/襄阳城外（骑汗血宝马向东北方急驰）', new: '大宋/襄阳/城外' },
  { file: '神雕\\事件\\第24回-01-天竺僧论毒辞行.txt', old: '大宋/襄阳城外（与武三通朱子柳一同出发前往绝情谷途中）', new: '大宋/襄阳/城外' },
  { file: '神雕\\事件\\第24回-01-天竺僧论毒辞行.txt', old: '大宋/襄阳城外（与天竺僧朱子柳一同出发前往绝情谷途中）', new: '大宋/襄阳/城外' },
  { file: '神雕\\事件\\第28回-05-黄蓉李莫愁郭芙赴终南寻妹.txt', old: '大宋/襄阳至终南山途中（与李莫愁、郭芙三人各乘牲口——向终南山进发。郭芙不喜李莫愁路上极少与她交谈）', new: '大宋/终南山/重阳宫' },
  { file: '神雕\\事件\\第28回-05-黄蓉李莫愁郭芙赴终南寻妹.txt', old: '大宋/襄阳至终南山途中（与黄蓉郭芙三人各乘牲口——向终南山进发。郭芙不喜自己路上极少交谈）', new: '大宋/终南山/重阳宫' },
  { file: '神雕\\事件\\第28回-05-黄蓉李莫愁郭芙赴终南寻妹.txt', old: '大宋/襄阳至终南山途中（与母亲和李莫愁三人各乘牲口——向终南山进发寻杨过的踪迹）', new: '大宋/终南山/重阳宫' },
  { file: '神雕\\事件\\第29回-02-众人会合黄蓉定计赴终南山寻杨过.txt', old: '大宋/襄阳至终南山途中（率领众人跟随汗血宝马向终南山进发）', new: '大宋/终南山/重阳宫' },
  { file: '神雕\\事件\\第29回-02-众人会合黄蓉定计赴终南山寻杨过.txt', old: '大宋/襄阳至终南山途中（随黄蓉一行向终南山进发——暗中严加戒备，歇宿时远离众人，白天赶路也遥遥在后）', new: '大宋/终南山/重阳宫' },
  { file: '神雕\\事件\\第29回-02-众人会合黄蓉定计赴终南山寻杨过.txt', old: '大宋/襄阳至终南山途中（随母亲一行向终南山进发）', new: '大宋/终南山/重阳宫' },
  { file: '神雕\\事件\\第2回-05-青袍人弹石退李莫愁救程英掳无双.txt', old: '未知', new: '大宋/嘉兴府/郊外' },
  { file: '神雕\\事件\\第2回-15-途遇武氏兄弟黄蓉葬武三娘收养二子.txt', old: '未知', new: '大宋/嘉兴府/郊外' },
  { file: '神雕\\事件\\第31回-03-慈恩抓郭襄黄蓉装疯救人慈恩大彻大悟离去.txt', old: '离开绝情谷飘然而去', new: '大宋/绝情谷/水仙山庄' },
  { file: '神雕\\事件\\第32回-15-杨过飘然离去海边练剑.txt', old: '大宋/东海之滨', new: '大宋/东海/海岸' },
  { file: '神雕\\事件\\第36回-06-第二件寿礼烟花传讯火烧南阳.txt', old: '大宋/南阳', new: '大宋/南阳/粮草营' },
  { file: '神雕\\事件\\第38回-02-黄蓉程英陆无双出城寻郭襄至风陵渡.txt', old: '大宋/风陵渡', new: '大宋/风陵渡/渡口' },
  { file: '神雕\\事件\\第38回-03-黄蓉随玉蜂遇周伯通发现蜂翅刺字解出绝情谷底.txt', old: '大宋/万花谷', new: '大宋/万花谷/谷中' },
  { file: '神雕\\事件\\第38回-08-金轮法王骗郭襄解穴逃脱挟持郭襄失踪.txt', old: '大宋/未知（被金轮法王挟持南行）', new: '蒙古/襄阳城外/蒙古军营' },
  { file: '神雕\\事件\\第38回-08-金轮法王骗郭襄解穴逃脱挟持郭襄失踪.txt', old: '大宋/绝情谷外（挟持郭襄南逃）', new: '大宋/绝情谷/水仙山庄' },
  { file: '神雕\\事件\\第39回-01-黄蓉七人回襄阳夜闯蒙古营入城.txt', old: '大宋/襄阳', new: '大宋/襄阳/城门' },
  { file: '神雕\\事件\\第39回-02-蒙古大军猛攻襄阳大战十二时辰.txt', old: '大宋/襄阳', new: '大宋/襄阳/城楼' },
  { file: '神雕\\事件\\第39回-03-蒙古军筑高台金轮法王以郭襄要挟郭靖投降.txt', old: '大宋/襄阳', new: '大宋/襄阳/城外' },
  { file: '神雕\\事件\\第39回-05-黄药师校场部署二十八宿大阵.txt', old: '大宋/襄阳', new: '大宋/襄阳/校场' },
  { file: '神雕\\事件\\第3回-02-初到桃花岛斗蟋蟀起冲突.txt', old: '大宋/桃花岛', new: '大宋/东海/桃花岛' },
  { file: '神雕\\事件\\第4回-08-郭靖托孤丘处机收杨过入门.txt', old: '大宋/桃花岛', new: '大宋/东海/桃花岛' },
  { file: '神雕\\事件\\第4回-09-丘处机训诫杨过师徒结怨.txt', old: '大宋/山西（赴山西支援途中）', new: '大宋/山西/太原' },
  { file: '神雕\\事件\\第40回-06-潇尹携猿离去杨过辞别众人.txt', old: '未知', new: '大宋/华山/山巅' },
  { file: '神雕\\事件\\第3回-10-全真道众误阻郭靖连破北斗阵.txt', old: '未知', new: '大宋/终南山/山道' },
];

// ============= 修复执行 =============

function fixLocationsInField(fieldValue, fileBaseName) {
  if (typeof fieldValue !== 'string') return fieldValue;

  // 先处理已知的规则
  for (const fix of over3Fix) {
    if (fileBaseName === fix.file && fieldValue === fix.old) {
      return fix.new;
    }
  }
  for (const fix of under3Fix) {
    if (fileBaseName === fix.file && fieldValue === fix.old) {
      return fix.new;
    }
  }

  return fieldValue;
}

function traverseAndFix(obj, fileBaseName) {
  if (typeof obj !== 'object' || obj === null) return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => traverseAndFix(item, fileBaseName));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === '事件地点' || key === '所在位置') {
      let newVal = fixLocationsInField(value, fileBaseName);
      // 检查是否匹配任何fix规则
      for (const fix of over3Fix) {
        if (fileBaseName === fix.file && value === fix.old) {
          newVal = fix.new;
          break;
        }
      }
      if (newVal === value) {
        for (const fix of under3Fix) {
          if (fileBaseName === fix.file && value === fix.old) {
            newVal = fix.new;
            break;
          }
        }
      }
      result[key] = newVal;
    } else {
      result[key] = traverseAndFix(value, fileBaseName);
    }
  }
  return result;
}

// 处理文件
let fixedCount = 0;

// 射雕事件
const sheDir = path.join(baseDir, '射雕\\事件');
if (fs.existsSync(sheDir)) {
  const files = fs.readdirSync(sheDir).filter(f => f.endsWith('.txt'));
  for (const file of files) {
    const filePath = path.join(sheDir, file);
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      const obj = JSON.parse(content);
      const fixed = traverseAndFix(obj, `射雕\\事件\\${file}`);
      const newContent = JSON.stringify(fixed, null, 2);
      if (content !== newContent) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        fixedCount++;
        console.log(`✓ Fixed: 射雕\\事件\\${file}`);
      }
    } catch (e) {
      console.error(`✗ Error on ${file}: ${e.message}`);
    }
  }
}

// 神雕事件
const shenDir = path.join(baseDir, '神雕\\事件');
if (fs.existsSync(shenDir)) {
  const files = fs.readdirSync(shenDir).filter(f => f.endsWith('.txt'));
  for (const file of files) {
    const filePath = path.join(shenDir, file);
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      const obj = JSON.parse(content);
      const fixed = traverseAndFix(obj, `神雕\\事件\\${file}`);
      const newContent = JSON.stringify(fixed, null, 2);
      if (content !== newContent) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        fixedCount++;
        console.log(`✓ Fixed: 神雕\\事件\\${file}`);
      }
    } catch (e) {
      console.error(`✗ Error on ${file}: ${e.message}`);
    }
  }
}

console.log(`\n======= 修复完成 =======`);
console.log(`共修复 ${fixedCount} 个文件`);
