const { SlashCommandBuilder } = require('discord.js');

// 25 command groups / exactly 222 subcommands (features).
const GROUPS = [
  ['admin', 'أوامر الإدارة المتقدمة', [
    ['clear','مسح رسائل من الروم'],['lock','قفل الروم'],['unlock','فتح الروم'],['slowmode','تحديد السلو مود'],['announce','إرسال إعلان'],['say','إرسال رسالة باسم البوت'],['embed','إرسال رسالة Embed'],['nick','تغيير لقب عضو'],['roleadd','إعطاء رتبة لعضو']
  ]],
  ['mod', 'أوامر الإدارة والعقوبات', [
    ['warn','تحذير عضو'],['warnings','عرض تحذيرات عضو'],['unwarn','حذف تحذير عضو'],['kick','طرد عضو'],['ban','حظر عضو'],['unban','فك حظر عبر الآيدي'],['timeout','تايم أوت'],['untimeout','إزالة التايم أوت'],['softban','Softban لعضو'],['purgeuser','حذف رسائل عضو'],['cleanup','تنظيف آخر الرسائل'],['mute','كتم عضو'],['unmute','فك الكتم'],['massrole','إدارة رتبة للأعضاء'],['note','ملاحظة إدارية على عضو']
  ]],
  ['security','الحماية ومكافحة المخالفات',[['antilink','حماية الروابط'],['antiimage','حماية الصور'],['antiinvite','حماية روابط الدعوات'],['antispam','حماية السبام'],['antiflood','حماية الفلود'],['mentionguard','حماية المنشنات'],['caps','حماية الحروف الكبيرة'],['profanity','فلتر الكلمات'],['joinraid','حماية دخول الغارات'],['duplicate','منع الرسائل المكررة'],['scam','حماية روابط الاحتيال'],['whitelist','قائمة سماح الحماية']]],
  ['tickets','نظام التذاكر',[['panel','إرسال لوحة التذاكر'],['create','فتح تذكرة'],['close','إغلاق التذكرة'],['add','إضافة عضو للتذكرة'],['remove','إزالة عضو من التذكرة'],['rename','تغيير اسم التذكرة'],['claim','استلام التذكرة'],['unclaim','ترك استلام التذكرة'],['transcript','إنشاء سجل للتذكرة'],['setup','إعداد التذاكر'],['config','إعدادات التذاكر'],['stats','إحصائيات التذاكر']]],
  ['store','ENO Store',[['panel','إرسال لوحة المتجر'],['productadd','إضافة منتج'],['productremove','حذف منتج'],['products','عرض المنتجات'],['terms','عرض الشروط'],['payments','عرض طرق الدفع'],['reviews','عرض آخر التقييمات'],['setcategory','تحديد تصنيف التذاكر'],['welcome','رسالة المتجر'],['info','معلومات المتجر'],['hours','أوقات الخدمة'],['status','حالة المتجر']]],
  ['rating','نظام التقييم',[['panel','إرسال لوحة تقييم العملاء'],['stats','إحصائيات التقييمات'],['reset','تصفير التقييمات'],['test','اختبار صورة التقييم'],['export','تصدير ملخص التقييمات']]],
  ['welcome','الترحيب والدخول',[['set','تحديد روم الترحيب'],['disable','إيقاف الترحيب'],['test','اختبار الترحيب'],['message','تغيير رسالة الترحيب'],['image','تشغيل صورة الترحيب'],['role','تشغيل الرتبة التلقائية'],['invites','إحصائيات الدعوات'],['channel','عرض روم الترحيب']]],
  ['logs','اللوق',[['set','تحديد روم اللوق'],['disable','إيقاف اللوق'],['mod','لوق العقوبات'],['joins','لوق الدخول'],['leaves','لوق الخروج'],['messages','لوق الرسائل'],['voice','لوق الصوت'],['tickets','لوق التذاكر']]],
  ['roles','إدارة الرتب',[['add','إضافة رتبة لعضو'],['remove','إزالة رتبة من عضو'],['create','إنشاء رتبة'],['delete','حذف رتبة'],['rename','تغيير اسم رتبة'],['color','تغيير لون رتبة'],['hoist','إظهار رتبة منفصلة'],['mentionable','السماح بمنشن الرتبة'],['info','معلومات رتبة'],['list','قائمة الرتب']]],
  ['channels','إدارة الرومات',[['create','إنشاء روم'],['delete','حذف روم'],['rename','تغيير اسم روم'],['topic','تغيير وصف روم'],['slowmode','تحديد سلو مود'],['lock','قفل روم'],['unlock','فتح روم'],['nsfw','تفعيل NSFW'],['info','معلومات روم'],['list','قائمة الرومات']]],
  ['voice','إدارة الصوت والرومات المؤقتة',[['setup','إعداد الرومات المؤقتة'],['create','إنشاء روم صوتي'],['delete','حذف روم صوتي'],['limit','تحديد حد الأعضاء'],['bitrate','تحديد جودة الصوت'],['rename','تغيير اسم روم صوتي'],['lock','قفل الروم'],['unlock','فتح الروم'],['permit','السماح لعضو'],['reject','منع عضو']]],
  ['utility','أدوات عامة',[['ping','سرعة البوت'],['avatar','أفاتار عضو'],['user','معلومات عضو'],['server','معلومات السيرفر'],['role','معلومات رتبة'],['channel','معلومات روم'],['bot','معلومات البوت'],['uptime','مدة تشغيل البوت'],['say','إرسال رسالة'],['emoji','معلومات إيموجي'],['banner','بنر عضو'],['timestamp','توليد Timestamp'],['invite','معلومات دعوة'],['snowflake','معلومات Snowflake'],['calc','حساب رياضي بسيط']]],
  ['fun','ترفيه',[['eightball','8Ball'],['coinflip','عملة'],['dice','نرد'],['roll','رمي رقم'],['choose','اختيار عشوائي'],['rps','حجر ورق مقص'],['slots','سلوتس'],['ship','نسبة توافق'],['roast','مزحة على عضو'],['compliment','مدح عضو'],['rate','تقييم عشوائي'],['reverse','عكس النص'],['scramble','لخبطة كلمة'],['random','رقم عشوائي']]],
  ['economy','اقتصاد',[['balance','رصيدك'],['daily','مكافأة يومية'],['weekly','مكافأة أسبوعية'],['work','العمل'],['crime','مخاطرة'],['fish','صيد'],['hunt','صيد'],['deposit','إيداع'],['withdraw','سحب'],['pay','تحويل لعضو'],['leaderboard','المتصدرون'],['shop','متجر الاقتصاد']]],
  ['levels','المستويات',[['rank','رتبتك'],['leaderboard','متصدرون XP'],['xp','عرض XP'],['addxp','إضافة XP'],['removexp','إزالة XP'],['reset','تصفير XP'],['set','تحديد XP'],['config','إعدادات المستويات']]],
  ['giveaway','السحوبات',[['start','بدء سحب'],['end','إنهاء سحب'],['reroll','اختيار فائز جديد'],['list','قائمة السحوبات'],['pause','إيقاف مؤقت'],['resume','استئناف'],['cancel','إلغاء'],['info','معلومات سحب']]],
  ['poll','الاستطلاعات',[['create','إنشاء استطلاع'],['close','إغلاق استطلاع'],['results','نتائج استطلاع'],['vote','التصويت'],['list','قائمة الاستطلاعات'],['reset','حذف الاستطلاعات']]],
  ['suggestion','الاقتراحات',[['panel','لوحة الاقتراحات'],['create','إضافة اقتراح'],['approve','قبول اقتراح'],['deny','رفض اقتراح'],['list','قائمة الاقتراحات'],['clear','مسح الاقتراحات']]],
  ['reminder','التذكيرات',[['add','إضافة تذكير'],['list','قائمة تذكيراتك'],['remove','حذف تذكير'],['clear','حذف كل التذكيرات'],['test','اختبار تذكير'],['snooze','تأجيل تذكير']]],
  ['afk','AFK',[['set','تفعيل AFK'],['remove','إلغاء AFK'],['status','حالة AFK'],['list','قائمة الموجودين AFK']]],
  ['reports','البلاغات',[['create','رفع بلاغ'],['list','قائمة البلاغات'],['claim','استلام بلاغ'],['close','إغلاق بلاغ'],['config','إعدادات البلاغات']]],
  ['automod','إعداد الحماية',[['setup','إعداد الحماية'],['enable','تشغيل الحماية'],['disable','إيقاف الحماية'],['words','إدارة الكلمات'],['exempt','استثناء عضو'],['links','إعداد الروابط'],['images','إعداد الصور'],['status','حالة الحماية']]],
  ['server','معلومات السيرفر',[['info','معلومات السيرفر'],['icon','أيقونة السيرفر'],['banner','بنر السيرفر'],['roles','عدد الرتب'],['emojis','عدد الإيموجيات'],['channels','عدد الرومات'],['members','عدد الأعضاء'],['stats','إحصائيات السيرفر']]],
  ['profile','الملف الشخصي',[['view','عرض الملف'],['setbio','تغيير البايو'],['setcolor','تغيير اللون'],['setstatus','تحديد الحالة'],['badges','عرض الشارات'],['rank','ترتيبك'],['reset','تصفير الملف']]],
  ['backup','النسخ الاحتياطي',[['create','إنشاء نسخة بيانات'],['list','عرض النسخ'],['info','معلومات نسخة'],['delete','حذف نسخة']]],
];

const count = GROUPS.reduce((n, g) => n + g[2].length, 0);
if (count !== 222) throw new Error(`Expected 222 features, found ${count}`);

const TARGET_ONLY = new Set([
  'warn','warnings','unwarn','kick','ban','timeout','untimeout','softban','purgeuser','mute','unmute','massrole','note',
  'nick','roleadd','roleadd','roleremove','add','remove','permit','reject','roast','compliment','ship','pay','rank','xp','addxp','removexp','setxp',
]);

function optionsFor(group, sub) {
  const target =
    (group === 'mod' && ['warn','warnings','unwarn','kick','ban','timeout','untimeout','softban','purgeuser','mute','unmute','massrole','note'].includes(sub)) ||
    (group === 'admin' && ['nick','roleadd'].includes(sub)) ||
    (group === 'tickets' && ['add','remove'].includes(sub)) ||
    (group === 'roles' && ['add','remove'].includes(sub)) ||
    (group === 'voice' && ['permit','reject'].includes(sub)) ||
    (group === 'fun' && ['roast','compliment','ship'].includes(sub)) ||
    (group === 'economy' && sub === 'pay');
  const number = ['clear','cleanup','slowmode','limit','bitrate','roll','random','addxp','removexp','set','timeout','mute','deposit','withdraw'].includes(sub);
  const text = ['announce','say','embed','nick','note','rename','topic','message','setbio','setstatus','productadd','productremove','products','terms','payments','welcome','hours','status','choose','reverse','scramble','quote','setcolor','create'].includes(sub);
  const reason = ['warn','kick','ban','timeout','untimeout','softban','mute','unmute','note'].includes(sub);
  const channel = ['announce','embed','set','channel','setcategory','logs'].includes(sub);
  const role = (group === 'admin' && sub === 'roleadd') || (group === 'roles' && ['add','remove','role'].includes(sub));
  return { target, number, text, reason, channel, role };
}
function addOptions(sc, sub, group) {
  const o = optionsFor(group, sub);
  const required = [];
  const optional = [];
  const addString = (name, description, isRequired=false, max=800) => (isRequired ? required : optional).push(() => sc.addStringOption(x => x.setName(name).setDescription(description).setRequired(isRequired).setMaxLength(max)));
  const addInt = (name, description, isRequired=false, min=0, max=1000000000) => (isRequired ? required : optional).push(() => sc.addIntegerOption(x => x.setName(name).setDescription(description).setRequired(isRequired).setMinValue(min).setMaxValue(max)));
  const addUser = (name='user', description='العضو') => required.push(() => sc.addUserOption(x => x.setName(name).setDescription(description).setRequired(true)));
  const addChannel = (name='channel', description='الروم') => required.push(() => sc.addChannelOption(x => x.setName(name).setDescription(description).setRequired(true)));
  const addRole = (name='role', description='الرتبة') => required.push(() => sc.addRoleOption(x => x.setName(name).setDescription(description).setRequired(true)));

  if (o.target) addUser();
  if (o.role && group !== 'roles') addRole();
  if (['welcome'].includes(group) && sub === 'set') addChannel();
  if (group === 'channels' && ['delete','rename','topic','slowmode','lock','unlock','nsfw','info'].includes(sub)) addChannel();
  if (group === 'voice' && ['delete','limit','bitrate','rename','lock','unlock'].includes(sub)) addChannel('channel','الروم الصوتي');
  if (group === 'roles' && ['delete','rename','color','hoist','mentionable','info'].includes(sub)) addRole();

  if (group === 'roles' && ['create','rename','color','hoist','mentionable'].includes(sub)) addString('text', sub==='create'?'اسم الرتبة':'القيمة / الاسم / اللون', true, 100);
  if (group === 'channels' && ['create','rename','topic'].includes(sub)) addString('text', sub==='topic'?'وصف الروم':'اسم / اسم جديد للروم', true, 1000);
  if (group === 'voice' && ['create','rename'].includes(sub)) addString('text', 'اسم الروم الصوتي', true, 100);
  if (group === 'poll' && sub === 'create') addString('question','السؤال',true,800);
  if (group === 'suggestion' && sub === 'create') addString('text','الاقتراح',true,800);
  if (group === 'reports' && sub === 'create') addString('text','تفاصيل البلاغ',true,800);
  if (group === 'afk' && sub === 'set') addString('text','سبب AFK',true,300);
  if (group === 'giveaway' && sub === 'start') {
    addString('prize','الجائزة',true,200);
    addInt('minutes','المدة بالدقائق',true,1,10080);
    addInt('winners','عدد الفائزين',true,1,20);
  }
  if (group === 'reminder' && sub === 'add') {
    addInt('minutes','بعد كم دقيقة؟',true,1,525600);
    addString('text','نص التذكير',true,800);
  }
  if (sub === 'productadd' && group === 'store') {
    addString('name','اسم المنتج',true,100);
    addInt('price','السعر',true,0,1000000000);
    addString('description','وصف المنتج',false,500);
  }
  if (sub === 'unban' && group === 'mod') addString('user_id','آيدي العضو',true,30);
  if (sub === 'ban' && group === 'mod') addString('user_id','آيدي العضو',false,30);
  if (group === 'giveaway' && ['end','reroll','pause','resume','cancel','info'].includes(sub)) addString('id','رقم السحب',true,40);
  if (group === 'reports' && ['claim','close'].includes(sub)) addString('id','رقم البلاغ',true,40);
  if (group === 'suggestion' && ['approve','deny'].includes(sub)) addString('id','رقم الاقتراح',true,40);
  if (group === 'poll' && ['close','results','vote'].includes(sub)) addString('id','رقم الاستطلاع',true,40);
  if (group === 'rating' && sub === 'test') addInt('number','عدد النجوم',false,1,5);

  const requiredText = [
    ['admin','announce'],['admin','say'],['admin','embed'],['admin','nick'],['admin','note'],
    ['welcome','message'],['profile','setbio'],['profile','setcolor'],['profile','setstatus'],
    ['fun','choose'],['fun','reverse'],['fun','scramble'],
    ['utility','say'],['utility','snowflake'],['utility','calc'],
    ['store','productremove']
  ];
  // Add common required/optional text only when a group-specific required input hasn't already been added.
  for (const [g,s] of requiredText) {
    if (g===group && s===sub) {
      if (!(group==='admin' && ['nick','note'].includes(sub)) && !['roles','channels','voice'].includes(group)) {
        addString('text','النص',true,800);
      } else if (group==='admin') addString('text', 'النص / الاسم', true,800);
    }
  }
  if (group==='product' && sub==='create') addString('text','النص',true,800);

  if (o.number && !(group==='giveaway' && sub==='start') && !(group==='reminder'&&sub==='add')) addInt('number','رقم / كمية',false,0,21600);
  if (o.reason) addString('reason','السبب',false,500);

  // Generic channel options for utility / admin commands not already covered.
  if (o.channel && !(['welcome'].includes(group) && sub==='set') && !(group==='channels'&&['delete','rename','topic','slowmode','lock','unlock','nsfw','info'].includes(sub)) && !(group==='voice'&&['delete','limit','bitrate','rename','lock','unlock'].includes(sub))) addChannel();
  if (o.text && !requiredText.some(([g,s])=>g===group&&s===sub) && !['roles','channels','voice','poll','suggestion','reports','afk','store'].includes(group)) addString('text','النص',false,800);

  for (const fn of required) fn();
  for (const fn of optional) fn();
  return sc;
}
function buildCommands() {
  const groups = GROUPS.map(([name, desc, subs]) => {
    const command = new SlashCommandBuilder().setName(name).setDescription(desc.slice(0,100));
    for (const [sub, subDesc] of subs) {
      command.addSubcommand(sc => {
        sc.setName(sub).setDescription(subDesc.slice(0,100));
        return addOptions(sc, sub, name);
      });
    }
    return command.toJSON();
  });
  groups.push(new SlashCommandBuilder().setName('help').setDescription('قائمة SystemBot222 والـ222 وظيفة').toJSON());
  return groups;
}

module.exports = { GROUPS, buildCommands };
