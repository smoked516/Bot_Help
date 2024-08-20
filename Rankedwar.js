const { SlashCommandBuilder } = require("discord.js");
const axios = require("axios");
const tornSchema = require("../../schemas/torn");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("Rankedwars")
    .setDescription("Provides information about a Torn faction's ranked wars.")
    .addStringOption((option) =>
      option
        .setName("faction_id")
        .setDescription("The Torn faction's ID")
        .setRequired(true)
    ),
  async execute(interaction) {
    const factionId = interaction.options.getString("faction_id");

    try {
      // Defer the interaction first if it's not already deferred
      if (!interaction.deferred) {
        await interaction.deferReply();
      }

      // Retrieve the API key from the database based on the UserName
      const userData = await tornSchema
        .findOne({ UserName: interaction.user.username })
        .exec();

      if (!userData) {
        await interaction.followUp(
          "Your Torn API key is not found in the database."
        );
        return;
      }

      const apiKey = userData.Api_Key;

      // Fetch the data from the Torn API using the provided URL
      const response = await axios.get(
        `https://api.torn.com/torn/?selections=rankedwars&key=${apiKey}&comment=DangerBot`
      );

      const rankedWars = response.data.rankedwars;

      if (!rankedWars) {
        await interaction.editReply(
          "No ranked war data available for any factions."
        );
        return;
      }

      // Find the ranked war that involves the input faction ID
      const warEntry = Object.values(rankedWars).find((war) =>
        Object.keys(war.factions).includes(factionId)
      );

      if (!warEntry) {
        await interaction.editReply(
          `No ranked war data available for faction ID: ${factionId}.`
        );
        return;
      }

      // Extract and format the ranked war information
      const faction1 = warEntry.factions[Object.keys(warEntry.factions)[0]];
      const faction2 = warEntry.factions[Object.keys(warEntry.factions)[1]];
      const warInfo = warEntry.war;

      const startDate = new Date(warInfo.start * 1000).toLocaleString();
      const endDate = warInfo.end
        ? new Date(warInfo.end * 1000).toLocaleString()
        : "Ongoing";
      const winner = warInfo.winner ? `Faction ${warInfo.winner}` : "Undecided";

      // Estimate the time remaining based on the war target and the 1% per hour decrease
      const currentTime = Math.floor(Date.now() / 1000);
      const elapsedTime = currentTime - warInfo.start;
      const elapsedHours = Math.floor(elapsedTime / 3600);
      const targetDecreaseRate = warInfo.target * 0.01; // 1% of the original value per hour
      const elapsedTargetDecrease = targetDecreaseRate * elapsedHours;
      const remainingTarget = Math.max(
        0,
        warInfo.target - elapsedTargetDecrease
      );

      // Calculate the remaining hours based on the remaining target
      const estimatedTimeRemainingHours = remainingTarget / targetDecreaseRate;
      const estimatedFinishTimestamp =
        currentTime + estimatedTimeRemainingHours * 3600;
      let estimatedFinishTime = new Date(estimatedFinishTimestamp * 1000);

      // Determine the current week's Tuesday at 12:00 PM
      const today = new Date();
      const currentDayOfWeek = today.getDay(); // Current day of the week (0=Sunday, 1=Monday, ..., 6=Saturday)
      const daysToTuesday = (2 - currentDayOfWeek + 7) % 7; // Days until next Tuesday
      const currentWeeksTuesday = new Date(today);
      currentWeeksTuesday.setDate(today.getDate() + daysToTuesday);
      currentWeeksTuesday.setHours(12, 0, 0, 0);

      // If the estimated finish time is after this week's Tuesday, set it to the Tuesday
      if (estimatedFinishTime > currentWeeksTuesday) {
        estimatedFinishTime = currentWeeksTuesday;
      }

      const estimatedFinishTimeStr = estimatedFinishTime.toLocaleString();

      const warMessage = `
**Ranked War Information**

**Faction 1:** ${faction1.name} (Score: ${faction1.score}, Chain: ${faction1.chain})
**Faction 2:** ${faction2.name} (Score: ${faction2.score}, Chain: ${faction2.chain})

**War Details:**
- Start: ${startDate}
- Target: ${warInfo.target}
- Winner: ${winner}
- Estimated Finish Time: ${estimatedFinishTimeStr}
`;

      // Reply to the interaction
      await interaction.editReply({
        content: warMessage,
      });
    } catch (error) {
      console.error("Error fetching Torn.com API:", error.message);

      // Check if the interaction is still pending before following up
      if (!interaction.replied) {
        await interaction.followUp({
          content:
            "An error occurred while fetching faction war data. Please check the faction ID and try again.",
        });
      }
    }
  },
};
