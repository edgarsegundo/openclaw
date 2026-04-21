VISTO_AMERICANO_CHANNEL_ID=1493298260821938176
DISNEY_ORLANDO_CHANNEL_ID=1495928421094658108

export default [
  {
    name: "FASTVISTOSARTICLES",
    token: process.env.FASTVISTOS_BOT_TOKEN,
    channels: [
      process.env.VISTO_AMERICANO_CHANNEL_ID,
      process.env.DISNEY_ORLANDO_CHANNEL_ID
    ],
  },
  // {
  //   name: "Bot2",
  //   token: process.env.BOT2_TOKEN,
  //   channelId: process.env.BOT2_CHANNEL_ID,
  // },
];
