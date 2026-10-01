// The optional "steer it" templates: proven tricks from real apps, in plain
// words. The upload supplies the pattern; a template only steers how the idea
// works. Each template names the real app it comes from.
export type Template = {
  id: string;
  /** Plain-words name, like "Don't break the streak". */
  name: string;
  /** The real App Store app this trick comes from. */
  sourceApp: string;
  /** The trick in one plain sentence, stripped of the source app's topic. */
  trick: string;
};

export const TEMPLATES: Template[] = [
  { id: 'last-minute-deal', name: 'Last-minute deal', sourceApp: 'Too Good To Go', trick: 'Stuff about to go to waste gets cheap at the last minute, so people grab it fast.' },
  { id: 'crowd-keeps-fresh', name: 'Crowd keeps it fresh', sourceApp: 'GasBuddy', trick: 'People nearby keep the information up to date because they want it too.' },
  { id: 'streak', name: "Don't break the streak", sourceApp: 'Duolingo', trick: 'A daily streak you really do not want to lose keeps you coming back.' },
  { id: 'people-map', name: 'See your people on a map', sourceApp: 'Find My', trick: 'The people you care about show up on a map, live.' },
  { id: 'swipe-match', name: 'Swipe to match', sourceApp: 'Tinder', trick: 'Swipe through options; when both sides say yes, it is a match.' },
  { id: 'everyone-at-once', name: 'Everyone posts at once', sourceApp: 'BeReal', trick: 'Everyone does the same thing at the same surprise moment, once a day.' },
  { id: 'walk-to-collect', name: 'Walk to real places to collect things', sourceApp: 'Pokémon GO', trick: 'Real places hold things you can only get by actually going there.' },
  { id: 'point-to-know', name: 'Hold it up to name it', sourceApp: 'Shazam', trick: 'Hold your phone up to something and it tells you exactly what it is, in seconds.' },
  { id: 'split-bill', name: 'Split the bill without the math', sourceApp: 'Splitwise', trick: 'Shared costs split themselves fairly, with no awkward math.' },
  { id: 'highest-bid', name: 'Highest bid wins', sourceApp: 'eBay', trick: 'People bid against each other and the highest bid wins when time runs out.' },
  { id: 'crowd-votes', name: 'The crowd votes the best to the top', sourceApp: 'Reddit', trick: 'Votes push the best stuff up where everyone sees it.' },
  { id: 'daily-puzzle', name: 'One puzzle a day, same for everyone', sourceApp: 'Wordle', trick: 'One shared daily challenge that everyone gets, once.' },
  { id: 'race-strangers', name: 'Race strangers on the same route', sourceApp: 'Strava', trick: 'Everyone who does the same stretch gets ranked, so you can race people you will never meet.' },
];

export function templateById(id: string | null | undefined): Template | undefined {
  return TEMPLATES.find((template) => template.id === id);
}
