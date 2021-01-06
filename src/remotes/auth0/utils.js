export const formatName = (format, given, family) => {
  if (format === 'initials') return `${given ? given[0].toUpperCase() : ''}${family ? family[0].toUpperCase() : ''}`;
  if (format === 'given') return given;
  if (format === 'short') return `${given}${family ? ` ${family[0].toUpperCase()}` : ''}`;
  return `${given} ${family}`;
};