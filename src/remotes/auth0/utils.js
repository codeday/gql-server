import emojiStrip from "emoji-strip";

export const formatName = (format, given, family) => {
  if (format === 'initials') return `${given ? given[0].toUpperCase() : ''}${family ? family[0].toUpperCase() : ''}`;
  if (format === 'given') return given;
  if (format === 'short') return `${given}${family ? ` ${family[0].toUpperCase()}` : ''}`;
  return `${given} ${family}`;
};

export const sanitizeUser = (user) => {
  let changes = {}
  if (user.badges) {
    const turtleAnPizzaBadges = user.badges.filter((badge) => badge.id === "turtle" || badge.id === "pizza")
    if (turtleAnPizzaBadges.length > 1) {
      user.badges = user.badges.filter((badge) => badge.id !== "turtle" && badge.id !== "pizza")
      const displayedBadges = user.badges.filter((b) => b.displayed === true).slice(0, 3)
      const notDisplayedBadges = user.badges.filter((badge) => badge.displayed !== true)
      displayedBadges.sort((a, b) => a.order - b.order)
      displayedBadges.map((badge, index) => { badge.displayed = true; badge.order = index; })
      user.badges = [...displayedBadges, ...notDisplayedBadges]
    }
  }
  if (user.givenName) {
    user.givenName = emojiStrip(user.givenName)
  }
  if (user.familyName) {
    user.familyName = emojiStrip(user.familyName)
  }
  if (user.givenName) {
    user.name = formatName(user.displayNameFormat, user.givenName, user.familyName)
  }
  console.log(user)
  return user
}