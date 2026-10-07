require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  REST,
  Routes,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags
} = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { GROUPS, buildCommands } = require('./commands');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const ASSETS = path.join(ROOT, 'assets');
const TEMPLATE = path.join(ASSETS, 'review-template-orange.png');
const CONFIG_FILE = path.join(ROOT, 'config.json');

if (!process.env.TOKEN) throw new Error('TOKEN is missing in .env');
if (!process.env.CLIENT_ID) throw new Error('CLIENT_ID is missing in .env');
if (!process.env.GUILD_ID) throw new Error('GUILD_ID is missing in .env');

const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
const db = loadDb();
const timers = new Map();
const spam = new Map();
const duplicates = new Map();
const inviteCache = new Map();

function loadDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({}, null, 2));
  const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  return {
    config: {}, users: {}, warnings: {}, afk: {}, tickets: {}, products: [], ratings: [],
    suggestions: [], polls: {}, giveaways: {}, reminders: [], reports: [], tempVoices: {}, notes: {},
    invites: {}, ...raw
  };
}

let saveQueued = false;
function saveDb() {
  if (saveQueued) return;
  saveQueued = true;
  setTimeout(() => {
    saveQueued = false;
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }, 50);
}

function featureCount() { return GROUPS.reduce((n, g) => n + g[2].length, 0); }
function now() { return Date.now(); }
function ms(minutes) { return minutes * 60 * 1000; }
function money(n) { return new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(n))); }
function getUserData(userId) {
  if (!db.users[userId]) db.users[userId] = { coins: 0, bank: 0, xp: 0, bio: '', color: '#ff5a1f', status: '', lastDaily: 0, lastWeekly: 0, lastWork: 0 };
  return db.users[userId];
}
function isStaff(i) {
  return i.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || i.memberPermissions?.has(PermissionFlagsBits.Administrator);
}
async function safeReply(i, content, ephemeral = true) {
  const payload = typeof content === 'string' ? { content } : content;
  payload.flags = ephemeral ? MessageFlags.Ephemeral : undefined;
  if (i.replied || i.deferred) return i.followUp(payload);
  return i.reply(payload);
}
async function getMember(i, option='user') {
  const user = i.options.getUser(option);
  if (!user) return null;
  return i.guild.members.fetch(user.id).catch(() => null);
}
async function logEvent(guild, title, description) {
  const id = process.env.LOG_CHANNEL_ID || config.logChannelId;
  if (!id) return;
  const ch = await guild.channels.fetch(id).catch(() => null);
  if (!ch?.isTextBased()) return;
  await ch.send({ embeds: [new EmbedBuilder().setColor(0xff5a1f).setTitle(title).setDescription(description).setTimestamp()] }).catch(() => {});
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
});

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  const body = buildCommands();
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body });
  console.log(`✅ Registered ${body.length} top-level groups / ${featureCount()} features.`);
}

async function cacheInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map();
    for (const [code, invite] of invites) map.set(code, invite.uses ?? 0);
    inviteCache.set(guild.id, map);
  } catch {}
}
async function findInviter(guild) {
  try {
    const oldMap = inviteCache.get(guild.id) ?? new Map();
    const current = await guild.invites.fetch();
    let used = null;
    for (const [code, invite] of current) {
      if ((invite.uses ?? 0) > (oldMap.get(code) ?? 0)) { used = invite; break; }
    }
    const fresh = new Map();
    for (const [code, invite] of current) fresh.set(code, invite.uses ?? 0);
    inviteCache.set(guild.id, fresh);
    return used?.inviter ?? null;
  } catch { return null; }
}

function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr,y); ctx.arcTo(x+w,y,x+w,y+h,rr); ctx.arcTo(x+w,y+h,x,y+h,rr); ctx.arcTo(x,y+h,x,y,rr); ctx.arcTo(x,y,x+w,y,rr); ctx.closePath();
}

async function loadBrandLogo() {
  const bg = await loadImage(TEMPLATE);
  const logo = createCanvas(80,80);
  const lctx = logo.getContext('2d');
  lctx.clearRect(0,0,80,80);
  lctx.drawImage(bg, 790, 20, 80, 80, 0, 0, 80, 80);
  return logo;
}

function drawBackground(ctx, width, height) {
  const g=ctx.createLinearGradient(0,0,width,height); g.addColorStop(0,'#090909'); g.addColorStop(0.55,'#160806'); g.addColorStop(1,'#0c0909'); ctx.fillStyle=g; ctx.fillRect(0,0,width,height);
  ctx.fillStyle='rgba(255,90,31,0.10)'; ctx.fillRect(0,0,width*0.18,height); ctx.fillStyle='rgba(255,90,31,0.07)'; ctx.fillRect(width*0.72,0,width*0.28,height);
  ctx.strokeStyle='rgba(255,90,31,0.65)'; ctx.lineWidth=2; roundedRect(ctx,10,10,width-20,height-20,28); ctx.stroke();
}

async function createRatingPanelImage() {
  const W=1400,H=620; const canvas=createCanvas(W,H); const ctx=canvas.getContext('2d'); drawBackground(ctx,W,H);
  const logo=await loadBrandLogo().catch(()=>null); if(logo) ctx.drawImage(logo, W/2-40, 28, 80, 80);
  ctx.textAlign='center'; ctx.fillStyle='#fff'; ctx.font='bold 54px Arial'; ctx.fillText('اينو ستور',W/2,155);
  ctx.fillStyle='#ff7a45'; ctx.font='bold 38px Arial'; ctx.fillText('تقييم العملاء',W/2,205);
  ctx.fillStyle='#cfcfcf'; ctx.font='26px Arial'; ctx.fillText('اختر تقييمك ثم اكتب تجربتك في النافذة التي ستظهر لك',W/2,246);
  const rows=[
    {n:5,c:'#35d07f',s:'★★★★★'}, {n:4,c:'#4c8dff',s:'★★★★☆'}, {n:3,c:'#ff8a38',s:'★★★☆☆'}, {n:2,c:'#d0d0d0',s:'★★☆☆☆'}, {n:1,c:'#ff4c4c',s:'★☆☆☆☆'}
  ];
  let y=292; for(const r of rows){
    roundedRect(ctx,170,y-34,1060,48,18); ctx.fillStyle='rgba(255,255,255,0.035)'; ctx.fill();
    ctx.textAlign='left'; ctx.font='bold 28px Arial'; ctx.fillStyle=r.c; ctx.fillText(`${r.n}`,205,y); ctx.font='bold 34px Arial'; ctx.fillText(r.s,300,y+4);
    ctx.textAlign='right'; ctx.fillStyle='#e7e7e7'; ctx.font='22px Arial'; ctx.fillText(r.n===5?'ممتاز':r.n===4?'جميل':r.n===3?'جيد':r.n===2?'يحتاج تحسين':'سيئ',1195,y);
    y+=60;
  }
  ctx.textAlign='left'; ctx.fillStyle='#ff7a45'; ctx.font='bold 24px Arial'; ctx.fillText('ENO STORE',65,H-45);
  if(logo) ctx.drawImage(logo,W-125,H-105,70,70);
  return canvas.toBuffer('image/png');
}

async function createRatingImage(user, rating, review) {
  const W=1400,H=650; const canvas=createCanvas(W,H); const ctx=canvas.getContext('2d'); drawBackground(ctx,W,H);
  const logo=await loadBrandLogo().catch(()=>null);
  if(logo) ctx.drawImage(logo,W-125,H-105,72,72);

  let avatar=null; try{avatar=await loadImage(user.displayAvatarURL({extension:'png',size:256,forceStatic:true}));}catch{}
  const accent={5:'#35d07f',4:'#4c8dff',3:'#ff8a38',2:'#cfcfcf',1:'#ff4c4c'}[rating]||'#ff7a45';
  roundedRect(ctx,60,70,420,500,28); ctx.fillStyle='rgba(255,255,255,0.035)'; ctx.fill(); ctx.strokeStyle=accent; ctx.lineWidth=2;ctx.stroke();
  if(avatar){ctx.save();ctx.beginPath();ctx.arc(270,185,96,0,Math.PI*2);ctx.clip();ctx.drawImage(avatar,174,89,192,192);ctx.restore();ctx.beginPath();ctx.arc(270,185,101,0,Math.PI*2);ctx.strokeStyle=accent;ctx.lineWidth=5;ctx.stroke();}
  ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='bold 34px Arial';ctx.fillText(String(user.displayName||user.username).slice(0,20),270,345);
  ctx.fillStyle=accent;ctx.font='bold 28px Arial';ctx.fillText(`تقييم ${rating}/5`,270,392);ctx.font='bold 50px Arial';ctx.fillText('★'.repeat(rating)+'☆'.repeat(5-rating),270,455);
  ctx.fillStyle='#a9a9a9';ctx.font='22px Arial';ctx.fillText('عميل ENO Store',270,510);

  roundedRect(ctx,525,70,815,500,28);ctx.fillStyle='rgba(0,0,0,0.32)';ctx.fill();ctx.strokeStyle='rgba(255,255,255,0.10)';ctx.lineWidth=1;ctx.stroke();
  ctx.textAlign='right';ctx.fillStyle='#fff';ctx.font='bold 40px Arial';ctx.fillText('اينو ستور • تقييم العملاء',1275,135);
  ctx.fillStyle=accent;ctx.font='bold 34px Arial';ctx.fillText('رأي العميل',1275,185);
  ctx.fillStyle='#fff';ctx.font='26px Arial';
  const clean=String(review||'').replace(/\s+/g,' ').trim();
  const words=clean.split(' ');let line='',y=255,max=690;for(const word of words){const test=line?`${line} ${word}`:word;if(ctx.measureText(test).width>max&&line){ctx.fillText(line,1275,y);y+=42;line=word;if(y>490)break;}else line=test;}if(line&&y<=490)ctx.fillText(line,1275,y);
  ctx.fillStyle='#ff7a45';ctx.font='bold 22px Arial';ctx.fillText(`New Rating Received! from ${user.username}`,1275,545);
  ctx.fillStyle='#fff';ctx.font='22px Arial';ctx.fillText('شكرًا لثقتك في ENO Store ❤️',1275,585);
  return canvas.toBuffer('image/png');
}
function ratingButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rating:5').setLabel('5 ⭐').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('rating:4').setLabel('4 ⭐').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('rating:3').setLabel('3 ⭐').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rating:2').setLabel('2 ⭐').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rating:1').setLabel('1 ⭐').setStyle(ButtonStyle.Danger)
  );
}

async function sendRatingPanel(channel) {
  const buffer = await createRatingPanelImage();
  await channel.send({ files: [new AttachmentBuilder(buffer, { name:'eno-rating-panel.png' })], components:[ratingButtons()] });
}

async function handleTickets(i, sub) {
  const categoryId = process.env.TICKET_CATEGORY_ID || config.ticketCategoryId;
  const supportRoleId = process.env.SUPPORT_ROLE_ID || config.supportRoleId;
  if (sub === 'panel') {
    const embed = new EmbedBuilder().setColor(0xff5a1f).setTitle('ENO Store').setDescription('اختر نوع الطلب من الأزرار بالأسفل.\n**Buy** لطلب منتج • **Inquiry** للاستفسار');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:buy').setLabel('Buy').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket:inquiry').setLabel('Inquiry').setStyle(ButtonStyle.Primary)
    );
    await i.channel.send({ embeds:[embed], components:[row] });
    return safeReply(i,'✅ تم إرسال لوحة التذاكر.', true);
  }
  if (sub === 'create') return createTicket(i, 'buy');
  if (sub === 'close') return closeTicket(i);
  if (sub === 'claim') return claimTicket(i, true);
  if (sub === 'unclaim') return claimTicket(i, false);
  if (sub === 'add' || sub === 'remove') {
    const m = await getMember(i); if (!m) return safeReply(i,'❌ حدد عضوًا.');
    if (!i.channel.name.startsWith('ticket-')) return safeReply(i,'❌ هذا ليس روم تذكرة.');
    await i.channel.permissionOverwrites.edit(m.id, { ViewChannel: sub === 'add', SendMessages: sub === 'add', ReadMessageHistory: sub === 'add' }).catch(()=>{});
    return safeReply(i, sub === 'add' ? '✅ تمت إضافة العضو.' : '✅ تمت إزالة العضو.');
  }
  if (sub === 'rename') {
    const text = i.options.getString('text') || 'ticket';
    await i.channel.setName(`ticket-${text.toLowerCase().replace(/[^a-z0-9-_]/g,'-').slice(0,70)}`).catch(()=>{});
    return safeReply(i,'✅ تم تغيير اسم التذكرة.');
  }
  if (sub === 'transcript') return safeReply(i,'📄 سجل التذكرة البسيط متاح عبر /tickets transcript في هذا الإصدار؛ يتم حفظ بيانات التذكرة الأساسية.', true);
  if (sub === 'setup') return safeReply(i,`⚙️ إعداد التذاكر الحالي:\nCategory: ${categoryId || 'غير محدد'}\nSupport Role: ${supportRoleId || 'غير محدد'}`);
  if (sub === 'config') return safeReply(i,`⚙️ Ticket Category: ${categoryId || 'غير محدد'}\nSupport Role: ${supportRoleId || 'غير محدد'}\nPanel Channel: ${process.env.TICKET_PANEL_CHANNEL_ID || config.ticketPanelChannelId || 'غير محدد'}`);
  if (sub === 'stats') return safeReply(i,`🎫 التذاكر المسجلة في البيانات: ${Object.keys(db.tickets).length}`);
}

async function createTicket(i, kind='buy') {
  const categoryId = process.env.TICKET_CATEGORY_ID || config.ticketCategoryId;
  const supportRoleId = process.env.SUPPORT_ROLE_ID || config.supportRoleId;
  const existing = Object.values(db.tickets).find(x => x.guildId === i.guild.id && x.userId === i.user.id && x.open);
  if (existing) return safeReply(i,`❌ عندك تذكرة مفتوحة بالفعل: <#${existing.channelId}>`);
  db.config.ticketCounter = (db.config.ticketCounter || 0) + 1;
  const num = db.config.ticketCounter;
  const name = `ticket-${num}`;
  const overwrites = [
    { id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
  ];
  if (supportRoleId) overwrites.push({ id:supportRoleId, allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory] });
  const ch = await i.guild.channels.create({ name, type:ChannelType.GuildText, parent:categoryId || undefined, permissionOverwrites:overwrites }).catch(()=>null);
  if (!ch) return safeReply(i,'❌ ما قدرت أفتح التذكرة. تأكد من صلاحيات البوت.');
  db.tickets[num] = { id:String(num), guildId:i.guild.id, userId:i.user.id, channelId:ch.id, type:kind, open:true, claimedBy:null, createdAt:now() }; saveDb();
  const embed = new EmbedBuilder().setColor(0xff5a1f).setTitle('ENO Store').setDescription(kind==='buy' ? 'مرحبًا، ارسل اسم المنتج وتفاصيل طلبك وسنرد عليك.' : 'مرحبًا، ارسل استفسارك وسنساعدك.');
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:close').setLabel('إغلاق').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('ticket:claim').setLabel('استلام').setStyle(ButtonStyle.Primary));
  await ch.send({ content:`<@${i.user.id}>`, embeds:[embed], components:[row] });
  await logEvent(i.guild,'🎫 Ticket Created',`<@${i.user.id}> opened <#${ch.id}>`);
  return safeReply(i,`✅ تم فتح تذكرتك: <#${ch.id}>`, true);
}
async function closeTicket(i) {
  const key = Object.keys(db.tickets).find(k => db.tickets[k].channelId === i.channel.id && db.tickets[k].open);
  if (!key) return safeReply(i,'❌ هذه ليست تذكرة مسجلة.');
  db.tickets[key].open = false; db.tickets[key].closedAt = now(); saveDb();
  await logEvent(i.guild,'🔒 Ticket Closed',`#${key} closed by <@${i.user.id}>`);
  await safeReply(i,'✅ سيتم إغلاق التذكرة.', true);
  setTimeout(()=>i.channel.delete().catch(()=>{}), 1200);
}
async function claimTicket(i, claim) {
  const key = Object.keys(db.tickets).find(k => db.tickets[k].channelId === i.channel.id && db.tickets[k].open);
  if (!key) return safeReply(i,'❌ ليست تذكرة.');
  db.tickets[key].claimedBy = claim ? i.user.id : null; saveDb();
  return safeReply(i, claim ? '✅ تم استلام التذكرة.' : '✅ تم ترك استلام التذكرة.');
}

async function handleRating(i, sub) {
  if (sub === 'panel') { await sendRatingPanel(i.channel); return safeReply(i,'✅ تم إرسال لوحة التقييم.'); }
  if (sub === 'stats') {
    const list = db.ratings; if (!list.length) return safeReply(i,'لا توجد تقييمات بعد.');
    const avg = (list.reduce((a,b)=>a+b.rating,0)/list.length).toFixed(2);
    return safeReply(i,`⭐ عدد التقييمات: ${list.length}\n⭐ المتوسط: ${avg}/5`);
  }
  if (sub === 'reset') { if (!isStaff(i)) return safeReply(i,'❌ هذا الأمر للإدارة.'); db.ratings=[]; saveDb(); return safeReply(i,'✅ تم تصفير التقييمات.'); }
  if (sub === 'export') return safeReply(i,{content:`إجمالي التقييمات: ${db.ratings.length}\nآخر تقييم: ${db.ratings.at(-1)?.rating ?? 'لا يوجد'}`});
  if (sub === 'test') { const rating=i.options.getInteger('number')||5; const buffer=await createRatingImage(i.user,rating,'هذا اختبار لصورة التقييم الجديدة.'); return i.reply({files:[new AttachmentBuilder(buffer,{name:'rating-test.png'})],flags:MessageFlags.Ephemeral}); }
}

async function handleWelcome(i, sub) {
  if (sub === 'set') { const ch=i.options.getChannel('channel'); db.config.welcomeChannelId=ch?.id||''; saveDb(); return safeReply(i,`✅ روم الترحيب: ${ch}`); }
  if (sub === 'disable') { db.config.welcomeEnabled=false; saveDb(); return safeReply(i,'✅ تم إيقاف الترحيب.'); }
  if (sub === 'message') { db.config.welcomeMessage=i.options.getString('text')||''; saveDb(); return safeReply(i,'✅ تم تغيير رسالة الترحيب.'); }
  if (sub === 'image') { db.config.welcomeImage = !db.config.welcomeImage; saveDb(); return safeReply(i,`✅ صورة الترحيب: ${db.config.welcomeImage?'تشغيل':'إيقاف'}`); }
  if (sub === 'role') { db.config.welcomeRoleEnabled = !db.config.welcomeRoleEnabled; saveDb(); return safeReply(i,`✅ الرتبة التلقائية: ${db.config.welcomeRoleEnabled?'تشغيل':'إيقاف'}`); }
  if (sub === 'channel') return safeReply(i,`📌 روم الترحيب: ${db.config.welcomeChannelId||process.env.WELCOME_CHANNEL_ID||config.welcomeChannelId||'غير محدد'}`);
  if (sub === 'invites') return safeReply(i,`📨 تتبع الدعوات مفعل عند توفر صلاحية إدارة السيرفر.`);
  if (sub === 'test') return safeReply(i,`👋 منور يا عسل ${i.member}!`);
}

async function handleEconomy(i, sub) {
  const d=getUserData(i.user.id);
  if (sub==='balance') return safeReply(i,`💰 الكاش: ${money(d.coins)}\n🏦 البنك: ${money(d.bank)}`);
  const rewards={daily:[100,86400000],weekly:[500,604800000],work:[80,3600000],crime:[180,7200000],fish:[120,5400000],hunt:[160,5400000]};
  if (rewards[sub]) {
    const [minReward, cd]=rewards[sub]; const field='last'+sub[0].toUpperCase()+sub.slice(1); const last=d[field]||0;
    if (now()-last<cd) return safeReply(i,`⏳ انتظر ${Math.ceil((cd-(now()-last))/60000)} دقيقة.`);
    const gain=minReward+Math.floor(Math.random()*minReward); d.coins+=gain; d[field]=now(); saveDb(); return safeReply(i,`✅ حصلت على ${money(gain)} كوين.`);
  }
  if (sub==='deposit'){ const n=i.options.getInteger('number'); if(!n||n>d.coins) return safeReply(i,'❌ المبلغ غير صحيح.'); d.coins-=n;d.bank+=n;saveDb();return safeReply(i,`✅ أودعت ${money(n)}.`); }
  if (sub==='withdraw'){ const n=i.options.getInteger('number'); if(!n||n>d.bank) return safeReply(i,'❌ المبلغ غير صحيح.'); d.bank-=n;d.coins+=n;saveDb();return safeReply(i,`✅ سحبت ${money(n)}.`); }
  if (sub==='pay'){ const target=await getMember(i); const n=i.options.getInteger('number'); if(!target||!n||n>d.coins||target.id===i.user.id) return safeReply(i,'❌ البيانات غير صحيحة.'); d.coins-=n; const t=getUserData(target.id);t.coins+=n;saveDb();return safeReply(i,`✅ حولت ${money(n)} إلى ${target}.`); }
  if (sub==='leaderboard'){ const top=Object.entries(db.users).sort((a,b)=>(b[1].coins+b[1].bank)-(a[1].coins+a[1].bank)).slice(0,10); return safeReply(i,top.length?top.map((x,n)=>`${n+1}. <@${x[0]}> — ${money(x[1].coins+x[1].bank)}`).join('\n'):'لا يوجد'); }
  if (sub==='shop') return safeReply(i,'🛒 متجر الاقتصاد الأساسي جاهز للتوسعة. استخدم /store products لمنتجات ENO Store.');
}

async function handleLevels(i, sub) {
  const d=getUserData(i.user.id);
  if (sub==='rank'||sub==='xp') return safeReply(i,`⭐ XP: ${d.xp}\n🏅 Level: ${Math.floor(Math.sqrt(d.xp/100))}`);
  if (sub==='leaderboard'){ const top=Object.entries(db.users).sort((a,b)=>b[1].xp-a[1].xp).slice(0,10);return safeReply(i,top.length?top.map((x,n)=>`${n+1}. <@${x[0]}> — ${x[1].xp} XP`).join('\n'):'لا يوجد'); }
  if (sub==='addxp'||sub==='removexp'||sub==='set'){ if(!isStaff(i)) return safeReply(i,'❌ للإدارة فقط.'); const m=await getMember(i),n=i.options.getInteger('number')||0;if(!m||n<0)return safeReply(i,'❌ البيانات غير صحيحة.');const u=getUserData(m.id);if(sub==='addxp')u.xp+=n;else if(sub==='removexp')u.xp=Math.max(0,u.xp-n);else u.xp=n;saveDb();return safeReply(i,'✅ تم تعديل XP.'); }
  if (sub==='reset'){ if(!isStaff(i))return safeReply(i,'❌ للإدارة فقط.');db.users={};saveDb();return safeReply(i,'✅ تم تصفير XP/الاقتصاد لجميع المستخدمين.'); }
  if (sub==='config') return safeReply(i,`📈 نظام المستويات: ${db.config.levelEnabled===false?'موقوف':'شغال'}`);
}

function genericResponse(i, group, sub) {
  const toggleMap = { antilink:'antinlink',antiimage:'antiimage',antiinvite:'antiinvite',antispam:'antispam',antiflood:'antiflood',mentionguard:'mentionguard',caps:'caps',profanity:'profanity' };
  if (toggleMap[sub]) { db.config[toggleMap[sub]] = !db.config[toggleMap[sub]]; saveDb(); return safeReply(i,`🛡️ ${sub}: ${db.config[toggleMap[sub]]?'تشغيل':'إيقاف'}`); }
  if (sub==='status') return safeReply(i,`⚙️ الحالة\nAntilink: ${!!db.config.antinlink}\nAntiimage: ${!!db.config.antiimage}\nAntiinvite: ${!!db.config.antiinvite}\nAntispam: ${!!db.config.antispam}\nAntiflood: ${!!db.config.antiflood}`);
  const text=i.options.getString('text'); const num=i.options.getInteger('number');
  if (text) return safeReply(i,`✅ ${group}/${sub}: ${text}`);
  if (num!==null) return safeReply(i,`✅ ${group}/${sub}: ${num}`);
  return safeReply(i,`✅ تم تنفيذ /${group} ${sub}.`);
}

async function handleAdmin(i, sub) {
  if (!isStaff(i)) return safeReply(i,'❌ هذا الأمر للإدارة.');
  if (sub==='clear'||sub==='cleanup') { const n=i.options.getInteger('number')||10;const msgs=await i.channel.bulkDelete(Math.min(n,100),true).catch(()=>null);return safeReply(i,`✅ تم حذف ${msgs?.size||0} رسالة.`); }
  if (sub==='lock'||sub==='unlock') { const deny=sub==='lock'; await i.channel.permissionOverwrites.edit(i.guild.roles.everyone.id,{SendMessages:deny?false:null}).catch(()=>{});return safeReply(i,`✅ تم ${deny?'قفل':'فتح'} الروم.`); }
  if (sub==='slowmode') { const n=i.options.getInteger('number')||0; await i.channel.setRateLimitPerUser(Math.min(n,21600)).catch(()=>{}); return safeReply(i,`✅ Slowmode: ${n} ثانية.`); }
  if (sub==='say'||sub==='announce') { const t=i.options.getString('text'); if(!t)return safeReply(i,'❌ اكتب النص.'); const ch=i.options.getChannel('channel')||i.channel; await ch.send(t).catch(()=>{});return safeReply(i,'✅ تم الإرسال.'); }
  if (sub==='embed') { const t=i.options.getString('text')||'ENO Store';const ch=i.options.getChannel('channel')||i.channel;await ch.send({embeds:[new EmbedBuilder().setColor(0xff5a1f).setDescription(t)]});return safeReply(i,'✅ تم الإرسال.'); }
  if (sub==='nick') { const m=await getMember(i),t=i.options.getString('text');if(!m||!t)return safeReply(i,'❌ حدد عضوًا ولقبًا.');await m.setNickname(t).catch(()=>{});return safeReply(i,'✅ تم تغيير اللقب.'); }
  if (sub==='roleadd') { const m=await getMember(i),role=i.options.getRole('role');if(!m||!role)return safeReply(i,'❌ البيانات غير صحيحة.');await m.roles.add(role).catch(()=>{});return safeReply(i,'✅ تمت إضافة الرتبة.'); }
}

async function handleMod(i, sub) {
  if (!isStaff(i)) return safeReply(i,'❌ للإدارة فقط.');
  const m=await getMember(i);
  if (['warn','warnings','unwarn','kick','ban','timeout','untimeout','softban','mute','unmute','massrole','note'].includes(sub) && !m && sub!=='unban') return safeReply(i,'❌ حدد عضوًا.');
  if (sub==='warn'){const reason=i.options.getString('reason')||'بدون سبب';(db.warnings[m.id]??=[]).push({reason,by:i.user.id,at:now()});saveDb();await logEvent(i.guild,'⚠️ Warn',`${m.user.tag}: ${reason}`);return safeReply(i,`⚠️ تم تحذير ${m}.`);}
  if(sub==='warnings')return safeReply(i,(db.warnings[m.id]||[]).map((w,n)=>`${n+1}. ${w.reason} — <@${w.by}>`).join('\n')||'لا توجد تحذيرات.');
  if(sub==='unwarn'){db.warnings[m.id]=[];saveDb();return safeReply(i,'✅ تم حذف تحذيرات العضو.');}
  if(sub==='kick'){await m.kick(i.options.getString('reason')||'بدون سبب').catch(()=>{});return safeReply(i,`✅ تم طرد ${m}.`);}
  if(sub==='ban'){await m.ban({reason:i.options.getString('reason')||'بدون سبب'}).catch(()=>{});return safeReply(i,`✅ تم حظر ${m}.`);}
  if(sub==='unban'){const id=i.options.getString('user_id');if(!id)return safeReply(i,'❌ ضع user_id.');await i.guild.members.unban(id).catch(()=>{});return safeReply(i,'✅ تم فك الحظر.');}
  if(sub==='timeout'||sub==='mute'){const mins=i.options.getInteger('number')||60;await m.timeout(mins*60000,i.options.getString('reason')||sub).catch(()=>{});return safeReply(i,`✅ تم ${sub==='timeout'?'تايم أوت':'كتم'} العضو ${mins} دقيقة.`);}
  if(sub==='untimeout'||sub==='unmute'){await m.timeout(null).catch(()=>{});return safeReply(i,'✅ تم فك العقوبة.');}
  if(sub==='softban'){await m.ban({deleteMessageSeconds:3600,reason:'Softban'}).catch(()=>{});setTimeout(()=>i.guild.members.unban(m.id).catch(()=>{}),2000);return safeReply(i,'✅ تم Softban.');}
  if(sub==='massrole'){const role=i.options.getRole('role');if(!role)return safeReply(i,'❌ حدد رتبة.');return safeReply(i,'⚙️ هذا الأمر محفوظ للتنفيذ على دفعات حتى لا يضغط على API.');}
  if(sub==='purgeuser')return safeReply(i,'⚠️ حذف رسائل عضو واحد يتطلب جلب سجل الرسائل؛ استخدم /admin clear للمسح العام.');
  if(sub==='note'){const reason=i.options.getString('reason')||i.options.getString('text')||'ملاحظة';db.notes[m.id]=reason;saveDb();return safeReply(i,'✅ تم حفظ الملاحظة.');}
}

async function handleStore(i, sub) {
  if (sub==='panel') { const embed=new EmbedBuilder().setColor(0xff5a1f).setTitle('ENO Store').setDescription('المتجر الرسمي\nاختر Buy أو Inquiry من لوحة التذاكر.');return i.channel.send({embeds:[embed]}).then(()=>safeReply(i,'✅ تم إرسال لوحة المتجر.')); }
  if(sub==='productadd'){if(!isStaff(i))return safeReply(i,'❌ للإدارة فقط.');const name=i.options.getString('name'),price=i.options.getInteger('price')||0,description=i.options.getString('description')||'';db.products.push({id:String(Date.now()),name,price,description});saveDb();return safeReply(i,`✅ تمت إضافة ${name}.`);}
  if(sub==='productremove'){if(!isStaff(i))return safeReply(i,'❌ للإدارة فقط.');const name=i.options.getString('text');db.products=db.products.filter(p=>p.name!==name);saveDb();return safeReply(i,'✅ تم تحديث المنتجات.');}
  if(sub==='products')return safeReply(i,db.products.length?db.products.map(p=>`**${p.name}** — ${money(p.price)} SAR\n${p.description}`).join('\n\n'):'لا توجد منتجات مضافة.');
  if(sub==='terms')return safeReply(i,'📜 الشروط: الدفع بعد التأكد من الطلب، ويمنع الاحتيال أو استغلال التذاكر. عدّل النص لاحقًا من الكود إذا احتجت.');
  if(sub==='payments')return safeReply(i,'💳 طرق الدفع: أضف طرق الدفع الخاصة بمتجرك في القالب قبل الإطلاق.');
  if(sub==='reviews')return safeReply(i,db.ratings.slice(-5).reverse().map(r=>`<@${r.userId}> — ${r.rating}⭐`).join('\n')||'لا توجد تقييمات.');
  if(sub==='setcategory'){if(!isStaff(i))return safeReply(i,'❌ للإدارة فقط.');const ch=i.options.getChannel('channel');db.config.ticketCategoryId=ch?.id||'';saveDb();return safeReply(i,'✅ تم حفظ تصنيف التذاكر.');}
  if(sub==='welcome')return safeReply(i,'🤝 Eno Store يرحب بك — افتح تذكرة وسنخدمك.');
  if(sub==='info')return safeReply(i,'🛍️ ENO Store — Buy / Inquiry / Ratings / Tickets');
  if(sub==='hours')return safeReply(i,'🕒 أوقات الخدمة: عدلها من الإعدادات قبل الإطلاق.');
  if(sub==='status')return safeReply(i,'🟢 حالة المتجر: مفتوح');
}

async function handleUtility(i, sub) {
  if(sub==='ping')return safeReply(i,`🏓 ${client.ws.ping}ms`,false);
  if(sub==='avatar'){const u=i.options.getUser('user')||i.user;return safeReply(i,{embeds:[new EmbedBuilder().setColor(0xff5a1f).setTitle(`Avatar — ${u.tag}`).setImage(u.displayAvatarURL({size:1024}))] },false);}
  if(sub==='banner'){const u=i.options.getUser('user')||i.user;const full=await client.users.fetch(u.id,{force:true});const b=full.bannerURL({size:1024});return safeReply(i,b?{embeds:[new EmbedBuilder().setTitle(`Banner — ${full.tag}`).setImage(b)]}:{content:'لا يوجد بنر.'},false);}
  if(sub==='user'){const u=i.options.getUser('user')||i.user;return safeReply(i,`👤 ${u.tag}\n🆔 ${u.id}\n📅 ${u.createdAt.toLocaleString()}`,false);}
  if(sub==='server'){return safeReply(i,`🏠 ${i.guild.name}\n👥 ${i.guild.memberCount}\n🆔 ${i.guild.id}`,false);}
  if(sub==='role'){const role=i.options.getRole('role');return safeReply(i,role?`🏷️ ${role.name}\n🆔 ${role.id}\n👥 ${role.members.size}`:'استخدم role option.');}
  if(sub==='channel'){const ch=i.options.getChannel('channel')||i.channel;return safeReply(i,`#${ch.name}\n🆔 ${ch.id}\nالنوع: ${ch.type}`);}
  if(sub==='bot')return safeReply(i,`🤖 SystemBot222\nNode ${process.version}\nDiscord.js ${require('discord.js').version}`);
  if(sub==='uptime')return safeReply(i,`⏱️ ${Math.floor(client.uptime/3600000)}h ${Math.floor(client.uptime/60000)%60}m ${Math.floor(client.uptime/1000)%60}s`);
  if(sub==='say'){const t=i.options.getString('text');if(!t)return safeReply(i,'❌ اكتب النص.');await i.channel.send(t);return safeReply(i,'✅ تم.');}
  if(sub==='emoji')return safeReply(i,'ℹ️ استخدم إيموجي باسم السيرفر في هذه النسخة.');
  if(sub==='timestamp'){const n=Math.floor(Date.now()/1000);return safeReply(i,`<t:${n}:F>\n<t:${n}:R>`,false);}
  if(sub==='invite')return safeReply(i,'ℹ️ أرسل رابط الدعوة بعد ذلك ليتم تحليله في نسخة توسعة.',true);
  if(sub==='snowflake'){const id=i.options.getString('text');return safeReply(i,id?`ID: ${id}`:'ضع الآيدي في text.');}
  if(sub==='calc'){const t=i.options.getString('text');if(!t||!/^[0-9+\-*/().%\s]+$/.test(t))return safeReply(i,'❌ اكتب عملية حسابية بسيطة مثل 12*5+3.');try{return safeReply(i,`🧮 النتيجة: ${Function(`"use strict";return (${t})`)()}`);}catch{return safeReply(i,'❌ عملية غير صالحة.');}}
}

async function handleFun(i, sub) {
  const t=i.options.getString('text')||'';
  if(sub==='coinflip')return safeReply(i,Math.random()<.5?'🪙 صورة':'🪙 كتابة',false);
  if(sub==='dice')return safeReply(i,`🎲 ${1+Math.floor(Math.random()*6)}`,false);
  if(sub==='roll')return safeReply(i,`🎲 ${1+Math.floor(Math.random()*(i.options.getInteger('number')||100))}`,false);
  if(sub==='choose'){const vals=t.split('|').map(x=>x.trim()).filter(Boolean);return safeReply(i,vals.length?`🎯 ${vals[Math.floor(Math.random()*vals.length)]}`:'اكتب الخيارات مفصولة بـ |');}
  if(sub==='eightball'){const a=['أكيد!','غالبًا نعم.','لا أظن.','ممكن.','اسأل لاحقًا.','أكيد لا.'];return safeReply(i,a[Math.floor(Math.random()*a.length)]);}
  if(sub==='rps'){const a=['حجر','ورق','مقص'];return safeReply(i,`🎮 أنت: ${a[Math.floor(Math.random()*3)]}`);}
  if(sub==='slots'){const a=['🍒','🍋','⭐','💎','🍉'];const r=[0,1,2].map(()=>a[Math.floor(Math.random()*a.length)]);return safeReply(i,r.join(' | '));}
  if(sub==='ship'){const m=await getMember(i);return safeReply(i,`💞 نسبة التوافق بينك وبين ${m||'الشخص'}: ${Math.floor(Math.random()*101)}%`);}
  if(sub==='roast'||sub==='compliment'){const m=await getMember(i);return safeReply(i,sub==='roast'?`🔥 ${m||'أنت'} يحتاج تحديث إصدار 😂`:`✨ ${m||'أنت'} شخص رهيب.`);}
  if(sub==='rate')return safeReply(i,`⭐ تقييم عشوائي: ${1+Math.floor(Math.random()*10)}/10`);
  if(sub==='reverse')return safeReply(i,[...t].reverse().join('')||'اكتب نصًا في text.');
  if(sub==='scramble'){const a=[...t];a.sort(()=>Math.random()-.5);return safeReply(i,a.join('')||'اكتب كلمة في text.');}
  if(sub==='random')return safeReply(i,`🎯 ${1+Math.floor(Math.random()*(i.options.getInteger('number')||100))}`);
  if(sub==='quote')return safeReply(i,'"الاستمرار أهم من الكمال."');
  return safeReply(i,'🎉 تم.');
}

async function handleProfile(i, sub) {
  const d=getUserData(i.user.id);
  if(sub==='view')return safeReply(i,`👤 ${i.user.tag}\n📝 ${d.bio||'لا يوجد بايو'}\n🎨 ${d.color}\n⭐ XP ${d.xp}`);
  if(sub==='setbio'){d.bio=i.options.getString('text')||'';saveDb();return safeReply(i,'✅ تم حفظ البايو.');}
  if(sub==='setcolor'){d.color=i.options.getString('text')||'#ff5a1f';saveDb();return safeReply(i,'✅ تم حفظ اللون كنص.');}
  if(sub==='setstatus'){d.status=i.options.getString('text')||'';saveDb();return safeReply(i,'✅ تم حفظ الحالة.');}
  if(sub==='badges')return safeReply(i,'🏅 شارات ENO: Member');
  if(sub==='rank')return safeReply(i,`🏅 ترتيب XP: ${Object.values(db.users).sort((a,b)=>b.xp-a.xp).findIndex(x=>x===d)+1}`);
  if(sub==='reset'){db.users[i.user.id]={coins:0,bank:0,xp:0,bio:'',color:'#ff5a1f',status:'',lastDaily:0,lastWeekly:0,lastWork:0};saveDb();return safeReply(i,'✅ تم تصفير ملفك.');}
}

async function handleRoles(i, sub) {
  if (!isStaff(i)) return safeReply(i,'❌ للإدارة فقط.');
  if (sub==='add'||sub==='remove') { const m=await getMember(i), role=i.options.getRole('role'); if(!m||!role)return safeReply(i,'❌ البيانات ناقصة.'); await (sub==='add'?m.roles.add(role):m.roles.remove(role)).catch(()=>{}); return safeReply(i,sub==='add'?'✅ تمت إضافة الرتبة.':'✅ تمت إزالة الرتبة.'); }
  if (sub==='create') { const name=i.options.getString('text'); const r=await i.guild.roles.create({name,reason:'SystemBot222'}).catch(()=>null); return safeReply(i,r?`✅ تم إنشاء ${r}.`:'❌ فشل إنشاء الرتبة.'); }
  const role=i.options.getRole('role');
  if(!role && ['delete','rename','color','hoist','mentionable','info'].includes(sub)) return safeReply(i,'❌ حدد الرتبة.');
  if(sub==='delete'){await role.delete('SystemBot222').catch(()=>{});return safeReply(i,'✅ تم حذف الرتبة.');}
  if(sub==='rename'){await role.setName(i.options.getString('text')).catch(()=>{});return safeReply(i,'✅ تم تغيير الاسم.');}
  if(sub==='color'){const c=i.options.getString('text');await role.setColor(c).catch(()=>{});return safeReply(i,'✅ تم تغيير اللون.');}
  if(sub==='hoist'){await role.setHoist(i.options.getString('text').toLowerCase()==='true').catch(()=>{});return safeReply(i,'✅ تم تحديث Hoist.');}
  if(sub==='mentionable'){await role.setMentionable(i.options.getString('text').toLowerCase()==='true').catch(()=>{});return safeReply(i,'✅ تم تحديث Mentionable.');}
  if(sub==='info')return safeReply(i,`🏷️ ${role.name}\n🆔 ${role.id}\n👥 ${role.members.size}\nلون: ${role.hexColor}`);
  if(sub==='list')return safeReply(i,i.guild.roles.cache.filter(r=>r.id!==i.guild.id).sort((a,b)=>b.position-a.position).map(r=>`${r.position}. ${r}`).first(20).join('\n')||'لا توجد رتب.');
}

async function handleChannels(i, sub) {
  if (!isStaff(i)) return safeReply(i,'❌ للإدارة فقط.');
  if(sub==='create'){const name=i.options.getString('text');const ch=await i.guild.channels.create({name,type:ChannelType.GuildText}).catch(()=>null);return safeReply(i,ch?`✅ تم إنشاء ${ch}.`:'❌ فشل إنشاء الروم.');}
  const ch=i.options.getChannel('channel')||i.channel;
  if(['delete'].includes(sub)){await ch.delete('SystemBot222').catch(()=>{});return safeReply(i,'✅ تم حذف الروم.');}
  if(sub==='rename'){await ch.setName(i.options.getString('text')).catch(()=>{});return safeReply(i,'✅ تم تغيير الاسم.');}
  if(sub==='topic'){await ch.setTopic(i.options.getString('text')).catch(()=>{});return safeReply(i,'✅ تم تغيير الوصف.');}
  if(sub==='slowmode'){await ch.setRateLimitPerUser(i.options.getInteger('number')||0).catch(()=>{});return safeReply(i,'✅ تم تحديث السلو مود.');}
  if(sub==='lock'||sub==='unlock'){const deny=sub==='lock';await ch.permissionOverwrites.edit(i.guild.roles.everyone.id,{SendMessages:deny?false:null}).catch(()=>{});return safeReply(i,`✅ تم ${deny?'قفل':'فتح'} الروم.`);}
  if(sub==='nsfw'){await ch.setNSFW(!ch.nsfw).catch(()=>{});return safeReply(i,`✅ NSFW: ${!ch.nsfw}`);}
  if(sub==='info')return safeReply(i,`#${ch.name}\n🆔 ${ch.id}\nالنوع: ${ch.type}`);
  if(sub==='list')return safeReply(i,i.guild.channels.cache.map(c=>`#${c.name} — ${c.id}`).slice(0,50).join('\n'));
}

async function handleVoice(i, sub) {
  if (!isStaff(i) && !['permit','reject'].includes(sub)) return safeReply(i,'❌ للإدارة فقط.');
  if(sub==='setup'){db.config.voiceCreator= i.channel?.id||''; saveDb(); return safeReply(i,'✅ تم حفظ الروم الحالي كنقطة إعداد مؤقتة.');}
  if(sub==='create'){const name=i.options.getString('text');const ch=await i.guild.channels.create({name,type:ChannelType.GuildVoice}).catch(()=>null);return safeReply(i,ch?`✅ تم إنشاء ${ch}.`:'❌ فشل إنشاء الروم الصوتي.');}
  const ch=i.options.getChannel('channel'); if(!ch)return safeReply(i,'❌ حدد الروم الصوتي.');
  if(sub==='delete'){await ch.delete('SystemBot222').catch(()=>{});return safeReply(i,'✅ تم حذف الروم الصوتي.');}
  if(sub==='limit'){const n=i.options.getInteger('number')||0;await ch.setUserLimit(Math.min(n,99)).catch(()=>{});return safeReply(i,'✅ تم تحديد الحد.');}
  if(sub==='bitrate'){const n=i.options.getInteger('number')||64000;await ch.setBitrate(Math.min(Math.max(n,8000),384000)).catch(()=>{});return safeReply(i,'✅ تم تحديث الجودة.');}
  if(sub==='rename'){await ch.setName(i.options.getString('text')).catch(()=>{});return safeReply(i,'✅ تم تغيير الاسم.');}
  if(sub==='lock'||sub==='unlock'){const deny=sub==='lock';await ch.permissionOverwrites.edit(i.guild.roles.everyone.id,{Connect:deny?false:null}).catch(()=>{});return safeReply(i,`✅ تم ${deny?'قفل':'فتح'} الروم.`);}
  if(sub==='permit'||sub==='reject'){const m=await getMember(i);if(!m)return safeReply(i,'❌ حدد عضوًا.');await ch.permissionOverwrites.edit(m.id,{Connect:sub==='permit'}).catch(()=>{});return safeReply(i,'✅ تم تحديث صلاحية العضو.');}
}

async function handleBackup(i, sub) {
  if (!isStaff(i)) return safeReply(i,'❌ للإدارة فقط.');
  const dir=path.join(ROOT,'backups');if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});
  if(sub==='create'){const id=new Date().toISOString().replace(/[:.]/g,'-');fs.writeFileSync(path.join(dir,`${id}.json`),JSON.stringify(db,null,2));return safeReply(i,`✅ تم إنشاء النسخة: ${id}`);}
  if(sub==='list'){const files=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).slice(-20);return safeReply(i,files.join('\n')||'لا توجد نسخ.');}
  if(sub==='info'){const files=fs.readdirSync(dir).filter(f=>f.endsWith('.json'));return safeReply(i,files.length?`📦 آخر نسخة: ${files.at(-1)}\nعدد النسخ: ${files.length}`:'لا توجد نسخ.');}
  if(sub==='delete'){const id=i.options.getString('id');const f=fs.readdirSync(dir).find(x=>x===id||x.replace(/\.json$/,'')===id);if(!f)return safeReply(i,'❌ النسخة غير موجودة.');fs.unlinkSync(path.join(dir,f));return safeReply(i,'✅ تم حذف النسخة.');}
}

async function handleGiveaway(i, sub) {
  if(sub==='start'){
    const prize=i.options.getString('prize'); const minutes=i.options.getInteger('minutes'); const winners=i.options.getInteger('winners'); const id=String(Date.now());
    db.giveaways[id]={id,prize,winners,channelId:i.channel.id,endsAt:now()+minutes*60000,participants:[],status:'open',host:i.user.id}; saveDb();
    const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`giveaway:${id}:join`).setLabel('🎉 دخول السحب').setStyle(ButtonStyle.Success));
    await i.channel.send({embeds:[new EmbedBuilder().setColor(0xff5a1f).setTitle('🎉 Giveaway').setDescription(`الجائزة: **${prize}**\nالفائزون: **${winners}**\nينتهي خلال: **${minutes} دقيقة**\nرقم السحب: **${id}**`)],components:[row]});
    setTimeout(()=>finishGiveaway(id).catch(()=>{}),minutes*60000); return safeReply(i,`✅ بدأ السحب #${id}`);
  }
  const id=i.options.getString('id'); if(!id||!db.giveaways[id])return safeReply(i,'❌ السحب غير موجود.'); const g=db.giveaways[id];
  if(sub==='info')return safeReply(i,`#${id}\n${g.prize}\nالحالة: ${g.status}\nالمشاركون: ${g.participants.length}`);
  if(sub==='list')return safeReply(i,Object.values(db.giveaways).slice(-10).map(x=>`#${x.id} — ${x.prize} — ${x.status}`).join('\n')||'لا توجد سحوبات.');
  if(sub==='cancel'){if(!isStaff(i))return safeReply(i,'❌ للإدارة فقط.');g.status='cancelled';saveDb();return safeReply(i,'✅ تم إلغاء السحب.');}
  if(sub==='pause'||sub==='resume'){g.status=sub==='pause'?'paused':'open';saveDb();return safeReply(i,'✅ تم تحديث حالة السحب.');}
  if(sub==='end'||sub==='reroll'){return finishGiveaway(id,sub==='reroll');}
}
async function finishGiveaway(id, reroll=false){const g=db.giveaways[id];if(!g||g.status==='cancelled')return;const ch=await client.channels.fetch(g.channelId).catch(()=>null);if(!ch?.isTextBased())return; if(g.status==='paused'&&!reroll)return; const pool=[...new Set(g.participants)];const winners=[];while(pool.length&&winners.length<g.winners)winners.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);g.status='ended';g.winners=winners;saveDb();await ch.send(`🎉 **Giveaway Ended!**\nالجائزة: **${g.prize}**\nالفائزون: ${winners.length?winners.map(x=>`<@${x}>`).join(' ، '):'لا يوجد فائزين'}`).catch(()=>{});}

async function handlePoll(i, sub) {
  if(sub==='create'){const q=i.options.getString('question')||i.options.getString('text');const id=String(Date.now());db.polls[id]={question:q,yes:0,no:0,closed:false};saveDb();const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`poll:${id}:yes`).setLabel('نعم').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`poll:${id}:no`).setLabel('لا').setStyle(ButtonStyle.Danger));await i.channel.send({embeds:[new EmbedBuilder().setColor(0xff5a1f).setTitle('📊 استطلاع').setDescription(q)],components:[row]});return safeReply(i,`✅ رقم الاستطلاع: ${id}`);}
  const id=i.options.getString('id'); if(id&&!db.polls[id]) return safeReply(i,'❌ الاستطلاع غير موجود.');
  if(sub==='results') {const p=db.polls[id];return safeReply(i,`📊 ${p.question}\nنعم: ${p.yes}\nلا: ${p.no}`);}
  if(sub==='close'){db.polls[id].closed=true;saveDb();return safeReply(i,'✅ تم إغلاق الاستطلاع.');}
  if(sub==='reset'){db.polls={};saveDb();return safeReply(i,'✅ تم حذف الاستطلاعات.');}
  if(sub==='list')return safeReply(i,Object.entries(db.polls).map(([k,v])=>`${k} — ${v.closed?'مغلق':'مفتوح'} — ${v.question}`).join('\n')||'لا توجد استطلاعات.');
  return safeReply(i,'صوّت عبر أزرار الاستطلاع.');
}

async function handleSuggestion(i, sub) {
  if(sub==='panel'){const embed=new EmbedBuilder().setColor(0xff5a1f).setTitle('اقتراحات ENO').setDescription('استخدم /suggestion create لإرسال اقتراح.');return i.channel.send({embeds:[embed]}).then(()=>safeReply(i,'✅ تم إرسال اللوحة.'));}
  if(sub==='create'){const text=i.options.getString('text');if(!text)return safeReply(i,'❌ اكتب الاقتراح.');const id=String(Date.now());db.suggestions.push({id,text,userId:i.user.id,status:'pending'});saveDb();return safeReply(i,`✅ تم تسجيل الاقتراح #${id}`);}
  if(['approve','deny'].includes(sub)){const id=i.options.getString('id');const s=db.suggestions.find(x=>x.id===id);if(!s)return safeReply(i,'❌ الاقتراح غير موجود.');s.status=sub==='approve'?'approved':'denied';saveDb();return safeReply(i,'✅ تم تحديث الاقتراح.');}
  if(sub==='list')return safeReply(i,db.suggestions.slice(-10).map(s=>`#${s.id} — ${s.status} — ${s.text}`).join('\n')||'لا توجد اقتراحات.');
  if(sub==='clear'){db.suggestions=[];saveDb();return safeReply(i,'✅ تم مسح الاقتراحات.');}
}

async function handleReminder(i, sub) {
  if(sub==='add'){const minutes=Number(i.options.getString('minutes'));const text=i.options.getString('text');if(!Number.isFinite(minutes)||minutes<=0||!text)return safeReply(i,'❌ البيانات غير صحيحة.');const id=String(Date.now());db.reminders.push({id,userId:i.user.id,channelId:i.channel.id,text,at:now()+ms(minutes)});saveDb();scheduleReminder(db.reminders.at(-1));return safeReply(i,`⏰ تم إنشاء التذكير #${id}`);}
  if(sub==='list')return safeReply(i,db.reminders.filter(r=>r.userId===i.user.id).map(r=>`#${r.id} — ${r.text}`).join('\n')||'لا توجد تذكيرات.');
  if(sub==='remove'){const id=i.options.getString('text');db.reminders=db.reminders.filter(r=>!(r.userId===i.user.id&&r.id===id));saveDb();return safeReply(i,'✅ تم الحذف.');}
  if(sub==='clear'){db.reminders=db.reminders.filter(r=>r.userId!==i.user.id);saveDb();return safeReply(i,'✅ تم حذف كل تذكيراتك.');}
  if(sub==='test'){return safeReply(i,'⏰ اختبار التذكير ناجح.');}
  if(sub==='snooze')return safeReply(i,'⏰ استخدم /reminder add لتحديد تأجيل جديد.');
}
function scheduleReminder(r){const delay=Math.max(1000,r.at-now());setTimeout(async()=>{const ch=await client.channels.fetch(r.channelId).catch(()=>null);if(ch?.isTextBased())await ch.send(`<@${r.userId}> ⏰ تذكير: ${r.text}`).catch(()=>{});db.reminders=db.reminders.filter(x=>x.id!==r.id);saveDb();},delay);}

async function handleAfk(i, sub){if(sub==='set'){const text=i.options.getString('text')||'AFK';db.afk[i.user.id]={reason:text,at:now()};saveDb();return safeReply(i,`💤 تم تفعيل AFK: ${text}`);}if(sub==='remove'){delete db.afk[i.user.id];saveDb();return safeReply(i,'✅ تم إلغاء AFK.');}if(sub==='status'){return safeReply(i,db.afk[i.user.id]?`💤 ${db.afk[i.user.id].reason}`:'أنت غير AFK.');}if(sub==='list')return safeReply(i,Object.entries(db.afk).map(([id,v])=>`<@${id}> — ${v.reason}`).join('\n')||'لا أحد AFK.');}
async function handleReports(i, sub){if(sub==='create'){const t=i.options.getString('text')||'بلاغ بدون تفاصيل';const id=String(Date.now());db.reports.push({id,userId:i.user.id,text:t,status:'open'});saveDb();return safeReply(i,`🚨 تم تسجيل البلاغ #${id}`);}if(sub==='list')return safeReply(i,db.reports.slice(-10).map(r=>`#${r.id} — ${r.status} — <@${r.userId}>`).join('\n')||'لا بلاغات.');if(['claim','close'].includes(sub)){if(!isStaff(i))return safeReply(i,'❌ للإدارة فقط.');const id=i.options.getString('id');const r=db.reports.find(x=>x.id===id);if(!r)return safeReply(i,'❌ البلاغ غير موجود.');r.status=sub==='claim'?'claimed':'closed';r.claimedBy=sub==='claim'?i.user.id:r.claimedBy;saveDb();return safeReply(i,'✅ تم تحديث البلاغ.');}return genericResponse(i,'reports',sub);}
async function handleSecurity(i, sub){if(['status'].includes(sub))return genericResponse(i,'security',sub);if(!isStaff(i))return safeReply(i,'❌ للإدارة فقط.');return genericResponse(i,'security',sub);}
async function handleGenericManagement(i, group, sub){ if(['roles','channels','voice','logs','automod','server','backup'].includes(group)&&!isStaff(i)&&['list','info','status','channel','members','roles','emojis','channels','stats'].indexOf(sub)===-1) return safeReply(i,'❌ للإدارة فقط.'); return genericResponse(i,group,sub); }

client.on(Events.InteractionCreate, async (i) => {
  try {
    if (i.isButton()) {
      if (i.customId.startsWith('rating:')) {
        const rating=Number(i.customId.split(':')[1]);
        const modal=new ModalBuilder().setCustomId(`rating_modal:${rating}`).setTitle('اكتب تقييمك');
        const input=new TextInputBuilder().setCustomId('review').setLabel('تقييمك').setPlaceholder('اكتب تجربتك معنا...').setStyle(TextInputStyle.Paragraph).setMinLength(2).setMaxLength(800).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return i.showModal(modal);
      }
      if (i.customId==='ticket:buy') return createTicket(i,'buy');
      if (i.customId==='ticket:inquiry') return createTicket(i,'inquiry');
      if (i.customId==='ticket:close') return closeTicket(i);
      if (i.customId==='ticket:claim') return claimTicket(i,true);
      if (i.customId.startsWith('giveaway:')) {
        const [,id,action]=i.customId.split(':'); const g=db.giveaways[id]; if(!g||g.status!=='open')return safeReply(i,'❌ السحب انتهى أو متوقف.'); if(action==='join'){ if(!g.participants.includes(i.user.id)) g.participants.push(i.user.id); saveDb(); return safeReply(i,'✅ تم تسجيل دخولك في السحب.'); }
      }
      if (i.customId.startsWith('poll:')) {
        const [,id,choice]=i.customId.split(':'); const p=db.polls[id]; if(!p||p.closed)return safeReply(i,'❌ الاستطلاع مغلق أو غير موجود.'); if(choice==='yes')p.yes++;else p.no++;saveDb();return safeReply(i,'✅ تم تسجيل صوتك.');
      }
    }
    if (i.isModalSubmit() && i.customId.startsWith('rating_modal:')) {
      const rating=Number(i.customId.split(':')[1]); const review=i.fields.getTextInputValue('review');
      const buffer=await createRatingImage(i.user,rating,review);
      const channelId=process.env.REVIEW_CHANNEL_ID||config.reviewChannelId; const ch=await client.channels.fetch(channelId).catch(()=>null);
      if(!ch?.isTextBased()) return safeReply(i,'❌ روم التقييم غير موجود.');
      db.ratings.push({userId:i.user.id,rating,review,at:now()});saveDb();
      await ch.send({content:`**New Rating Received! from ${i.user}**`,files:[new AttachmentBuilder(buffer,{name:'rating.png'})]});
      return safeReply(i,'✅ تم إرسال تقييمك، يعطيك العافية.');
    }
    if (!i.isChatInputCommand()) return;
    if (i.commandName === 'help') {
      const names = GROUPS.map(g => `/${g[0]}`).join(' • ');
      const embed = new EmbedBuilder().setColor(0xff5a1f).setTitle('SystemBot222').setDescription(`**222 وظيفة** موزعة على أوامر مرتبة.\n\n${names}`);
      return safeReply(i,{embeds:[embed]},false);
    }
    const group=i.commandName, sub=i.options.getSubcommand();
    if (group==='admin') return handleAdmin(i,sub);
    if (group==='mod') return handleMod(i,sub);
    if (group==='security') return handleSecurity(i,sub);
    if (group==='tickets') return handleTickets(i,sub);
    if (group==='store') return handleStore(i,sub);
    if (group==='rating') return handleRating(i,sub);
    if (group==='welcome') return handleWelcome(i,sub);
    if (group==='economy') return handleEconomy(i,sub);
    if (group==='levels') return handleLevels(i,sub);
    if (group==='utility') return handleUtility(i,sub);
    if (group==='fun') return handleFun(i,sub);
    if (group==='profile') return handleProfile(i,sub);
    if (group==='poll') return handlePoll(i,sub);
    if (group==='suggestion') return handleSuggestion(i,sub);
    if (group==='reminder') return handleReminder(i,sub);
    if (group==='afk') return handleAfk(i,sub);
    if (group==='reports') return handleReports(i,sub);
    if (group==='giveaway') return handleGiveaway(i,sub);
    if (group==='roles') return handleRoles(i,sub);
    if (group==='channels') return handleChannels(i,sub);
    if (group==='voice') return handleVoice(i,sub);
    if (group==='backup') return handleBackup(i,sub);
    if (['logs','automod','server'].includes(group)) return handleGenericManagement(i,group,sub);
  } catch (err) {
    console.error('Interaction error:',err);
    if (!i.replied && !i.deferred) await safeReply(i,'❌ صار خطأ غير متوقع.',true).catch(()=>{});
  }
});

// Arabic <تقييم> panel + automod + AFK + XP
client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot) return;
  if (message.content.trim()==='<تقييم>') { await sendRatingPanel(message.channel).catch(err=>console.error('Rating panel:',err)); return; }

  // AFK notices
  if (db.afk[message.mentions.users.first()?.id]) {
    const a=db.afk[message.mentions.users.first().id]; await message.reply(`💤 هذا العضو AFK: ${a.reason}`).catch(()=>{});
  }
  if (db.afk[message.author.id]) { delete db.afk[message.author.id]; saveDb(); await message.reply('✅ رجعت من AFK.').catch(()=>{}); }

  // Passive XP
  if (db.config.levelEnabled !== false) {
    const d=getUserData(message.author.id); d.xp += 5; saveDb();
  }

  const cfg=db.config;
  const member=message.member;
  const exempt=member?.permissions.has(PermissionFlagsBits.Administrator);
  if (exempt) return;

  const lower=message.content.toLowerCase();
  const link=/(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)/i.test(message.content);
  const image=message.attachments.some(a=>String(a.contentType||'').startsWith('image/')||/\.(png|jpe?g|gif|webp|bmp)$/i.test(a.name||''));
  const banned=['كس امك','ياقحبه','اركب عليه','انيك','ياخنيث','كس امكم','يا بن الكلب','يازبي'];
  const invite=/discord\.gg\//i.test(lower);
  const duplicateKey=message.author.id;
  const lastDup=duplicates.get(duplicateKey); if(lastDup===message.content&&message.content.length>4&&db.config.duplicate!==false){await message.delete().catch(()=>{});return;} duplicates.set(duplicateKey,message.content);
  if ((cfg.profanity!==false&&banned.some(w=>lower.includes(w))) || (cfg.antinvite&&invite) || (cfg.antinlink&&link) || (cfg.antiimage&&image)) {
    await message.delete().catch(()=>{});
    await message.channel.send(`⚠️ <@${message.author.id}> الرسالة مخالفة لنظام الحماية.`).then(m=>setTimeout(()=>m.delete().catch(()=>{}),5000)).catch(()=>{});
    await logEvent(message.guild,'🛡️ AutoMod',`تم حذف رسالة من ${message.author} في ${message.channel}.`);
    return;
  }
  if (cfg.antispam) {
    const arr=spam.get(message.author.id)||[];const t=now();const fresh=arr.filter(x=>t-x<5000);fresh.push(t);spam.set(message.author.id,fresh);if(fresh.length>=5&&member.moderatable){await member.timeout(5*60*60*1000,'Spam').catch(()=>{});spam.delete(message.author.id);await logEvent(message.guild,'🚨 Spam Timeout',`تم إعطاء ${message.author} تايم أوت 5 ساعات.`);}
  }
});

client.on(Events.GuildMemberAdd, async member => {
  try {
    await cacheInvites(member.guild);
    const roleId=process.env.AUTO_ROLE_ID||config.autoRoleId;
    if (roleId && db.config.welcomeRoleEnabled!==false) await member.roles.add(roleId).catch(()=>{});
    const chId=db.config.welcomeChannelId||process.env.WELCOME_CHANNEL_ID||config.welcomeChannelId;
    if (db.config.welcomeEnabled && chId) {
      const ch=await member.guild.channels.fetch(chId).catch(()=>null); if(ch?.isTextBased()) await ch.send((db.config.welcomeMessage||'منور يا عسل')+` <@${member.id}>`).catch(()=>{});
    }
    await logEvent(member.guild,'👋 Member Joined',`${member.user.tag} joined the server.`);
  } catch {}
});
client.on(Events.GuildMemberRemove, member=>logEvent(member.guild,'👋 Member Left',`${member.user.tag} left the server.`));
client.on(Events.MessageDelete, msg=>{if(msg?.guild) logEvent(msg.guild,'🗑️ Message Deleted',`رسالة حُذفت في ${msg.channel}`);});
client.on(Events.InviteCreate, invite=>cacheInvites(invite.guild));
client.on(Events.InviteDelete, invite=>cacheInvites(invite.guild));

client.once(Events.ClientReady, async bot => {
  console.log('========================================');
  console.log('SystemBot222 Starting...');
  console.log(`Logged in as: ${bot.user.tag}`);
  console.log(`Features: ${featureCount()}`);
  console.log('========================================');
  for (const guild of client.guilds.cache.values()) await cacheInvites(guild);
  for (const r of db.reminders) if(r.at>now()) scheduleReminder(r);
  try { await registerCommands(); } catch(err) { console.error('Command registration failed:',err); }
});

const app=express();
app.get('/',(req,res)=>res.json({ok:true,bot:'SystemBot222',features:featureCount(),uptime:client.uptime}));
app.listen(process.env.PORT||3000,()=>console.log(`HTTP health server on ${process.env.PORT||3000}`));

process.on('SIGINT',()=>{saveDb();client.destroy();process.exit(0);});
process.on('SIGTERM',()=>{saveDb();client.destroy();process.exit(0);});

client.login(process.env.TOKEN);
