require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
}); 
const commands = [ 
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("يعرض سرعة استجابة البوت"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("يعرض قائمة أوامر البوت"),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("يمسح عددًا من الرسائل")
    .addIntegerOption((option) =>
      option
        .setName("number")
        .setDescription("عدد الرسائل")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("طرد عضو")
    .addUserOption((option) =>
      option
        .setName("member")
        .setDescription("العضو")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("سبب الطرد")
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("حظر عضو")
    .addUserOption((option) =>
      option
        .setName("member")
        .setDescription("العضو")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("سبب الحظر")
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("إعطاء تايم أوت")
    .addUserOption((option) =>
      option
        .setName("member")
        .setDescription("العضو")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("minutes")
        .setDescription("عدد الدقائق")
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("السبب")
    ),
].map((command) => command.toJSON());

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ اشتغل البوت: ${readyClient.user.tag}`);

  try {
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(
        "1529195426354303058",
        "1340694385171632209"
      ),
      { body: commands }
    );

    console.log("✅ تم تسجيل أوامر السلاش");
  } catch (error) {
    console.error("❌ خطأ في تسجيل الأوامر:", error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    return interaction.reply(
      `🏓 سرعة البوت: ${client.ws.ping}ms`
    );
  }

  if (interaction.commandName === "help") {
    const embed = new EmbedBuilder()
      .setTitle("📋 أوامر SystemBot")
      .setDescription("قائمة أوامر البوت")
      .addFields(
        { name: "/ping", value: "يعرض سرعة البوت" },
        { name: "/help", value: "يعرض قائمة الأوامر" },
        { name: "/clear", value: "يمسح عددًا من الرسائل" },
        { name: "/kick", value: "يطرد عضوًا من السيرفر" },
        { name: "/ban", value: "يحظر عضوًا من السيرفر" },
        { name: "/timeout", value: "يعطي العضو تايم أوت" }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "clear") {
    if (
      !interaction.memberPermissions.has(
        PermissionFlagsBits.ManageMessages
      )
    ) {
      return interaction.reply({
        content: "❌ ما عندك صلاحية إدارة الرسائل.",
        ephemeral: true,
      });
    }

    const number = interaction.options.getInteger("number");

    try {
      const deleted = await interaction.channel.bulkDelete(
        number,
        true
      );

      return interaction.reply({
  content: `✅ تم مسح ${deleted.size} رسالة.`,
  ephemeral: true,
});
    } catch (error) {
      console.error(error);

      return interaction.reply({
        content: "❌ ما قدرت أمسح الرسائل.",
        ephemeral: true,
      });
    }
  } 
if (interaction.commandName === "kick")
   {
    if (
      !interaction.memberPermissions.has(
        PermissionFlagsBits.KickMembers
      )
    ) {
      return interaction.reply({
        content: "❌ ما عندك صلاحية طرد الأعضاء.",
        ephemeral: true,
      });
    }

    const member = interaction.options.getMember("member");
    const reason =
      interaction.options.getString("reason") || "بدون سبب";

    if (!member) {
      return interaction.reply({
        content: "❌ العضو غير موجود.",
        ephemeral: true,
      });
    }

    if (!member.kickable) {
      return interaction.reply({
        content:
          "❌ ما أقدر أطرد هذا العضو. تأكد أن رتبة البوت أعلى من رتبته.",
        ephemeral: true,
      });
    }

    try {
      await member.kick(reason);

      return interaction.reply({
        content: `✅ تم طرد ${member.user.tag}\nالسبب: ${reason}`,
      });
    } catch (error) {
      console.error(error);

      return interaction.reply({
        content: "❌ حصل خطأ وما قدرت أطرد العضو.",
        ephemeral: true,
      });
    }
  }
});
const bannedWords = [
  "كس امك",
  "ياقحبه",
  "اركب عليه ",
  "انيك",
  "ياجراج",
  "ياخنيث",
  "مص بس",
  "كس امكم ",
  "يابن الكلب",
  "يازبي",
];
const OWNER_ID = "1157482210803318795";

// حماية من السبام
const spamUsers = new Map();

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild) return;
  if (message.author.bot) return;
  if (!message.member) return;

  // تجاهل الإداريين
  if (
    message.member.permissions.has(
      PermissionFlagsBits.Administrator
    )
  ) {
    return;
  }

  const userId = message.author.id;
  const now = Date.now();

  let userData = spamUsers.get(userId) || {
    messages: [],
  };

  // الاحتفاظ برسائل آخر 5 ثوانٍ
  userData.messages = userData.messages.filter(
    (time) => now - time < 5000
  );

  userData.messages.push(now);
  spamUsers.set(userId, userData);

  // 5 رسائل خلال 5 ثوانٍ
  if (userData.messages.length >= 5) {
    try {
      if (!message.member.moderatable) {
        console.log("ما قدرت أعطي العضو تايم أوت، تأكد أن رتبة البوت أعلى.");
        spamUsers.delete(userId);
        return;
      }

      // تايم أوت 5 ساعات
      await message.member.timeout(
        5 * 60 * 60 * 1000,
        "إرسال رسائل كثيرة بسرعة"
      );

      await message.channel.send(
        `⚠️ <@${message.author.id}> طفل انت خذ تايم اوت خمس ساعات، ترا كنت بعطيك يوم بس رحمتك.`
      );

      // إرسال تنبيه لك بالخاص
      const owner = await client.users
        .fetch(OWNER_ID)
        .catch(() => null);

      if (owner) {
        await owner.send(
`🚨 تم رصد سبام

👤 العضو: ${message.author.tag}
🆔 الآيدي: ${message.author.id}
📍 السيرفر: ${message.guild.name}
⏱️ العقوبة: تايم أوت لمدة 5 ساعات`
        ).catch((error) => {
          console.error("ما قدرت أرسل رسالة خاصة للمالك:", error);
        });
      }

      spamUsers.delete(userId);

    } catch (error) {
      console.error("خطأ في حماية السبام:", error);
    }
  }
}); 
// حماية من الروابط والصور
client.on(Events.MessageCreate, async (message) => {
  if (!message.guild) return;
  if (message.author.bot) return;
  if (!message.member) return;

  // تجاهل الإداريين
  if (
    message.member.permissions.has(
      PermissionFlagsBits.Administrator
    )
  ) {
    return;
  }

  // اكتشاف الروابط
  const linkRegex =
    /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)/i;

  const hasLink = linkRegex.test(message.content);

  // اكتشاف الصور المرفوعة
  const hasImage = message.attachments.some((attachment) => {
    const type = attachment.contentType || "";

    return (
      type.startsWith("image/") ||
      /\.(png|jpe?g|gif|webp|bmp)$/i.test(
        attachment.name || ""
      )
    );
  });

  if (!hasLink && !hasImage) return;

  const violationType =
    hasLink && hasImage
      ? "رابط وصورة"
      : hasLink
      ? "رابط"
      : "صورة";

  const originalMessage =
    message.content || "لا يوجد نص، مرفق فقط";

  try {
    if (message.deletable) {
      await message.delete();
    }

    await message.channel
      .send(
        `⚠️ <@${message.author.id}> ممنوع إرسال الروابط والصور.`
      )
      .then((warning) => {
        setTimeout(() => {
          warning.delete().catch(() => {});
        }, 5000);
      });

    // إرسال التفاصيل لك بالخاص
    const owner = await client.users
      .fetch(OWNER_ID)
      .catch(() => null);

    if (owner) {
      await owner
        .send(
`🚨 مخالفة روابط أو صور

👤 العضو: ${message.author.tag}
🆔 الآيدي: ${message.author.id}
📍 السيرفر: ${message.guild.name}
📝 نوع المخالفة: ${violationType}
💬 الرسالة: ${originalMessage}`
        )
        .catch(() => {});
    }
  } catch (error) {
    console.error("خطأ في حماية الروابط والصور:", error);
  }
});
client.login(process.env.TOKEN);