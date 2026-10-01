// The optional "steer it" templates: proven tricks from real apps, in plain
// words. The upload supplies the pattern; a template only steers how the idea
// works. Each template names the real app it comes from, the phone layout its
// apps are drawn in, and sample content for its preview card.
import type { Kit } from './types.ts';

export type PhoneLayout = 'list' | 'countdown' | 'map' | 'streak' | 'swipe';

export type Template = {
  id: string;
  /** Plain-words name, like "Don't break the streak". */
  name: string;
  /** The real App Store app this trick comes from. */
  sourceApp: string;
  /** The trick in one plain sentence, stripped of the source app's topic. */
  trick: string;
  /** The phone layout this kind of app is drawn in. */
  layout: PhoneLayout;
  /** What the preview card shows. Made up, never presented as data. */
  sample: Kit['screen'];
};

const tabs = (first: string, ...rest: string[]) => [first, ...rest];
const card = (title: string, detail: string, tag: string) => ({ title, detail, tag });

export const TEMPLATES: Template[] = [
  { id: 'last-minute-deal', name: 'Last-minute deal', sourceApp: 'Too Good To Go', trick: 'Stuff about to go to waste gets cheap at the last minute, so people grab it fast.', layout: 'countdown', sample: { title: 'Tonight', greeting: 'Closing soon near you', hero_label: 'Bakery bags end in', hero_value: '42 min', primary_action: 'Grab a bag', cards: [card('Corner Bakery', 'Bread and pastries', '$3.99'), card('Sushi Go', 'Chef’s mix box', '$5.50'), card('Green Grocer', 'Fruit and veg', '$2.99')], tabs: tabs('Tonight', 'Map', 'Saved', 'Profile') } },
  { id: 'crowd-keeps-fresh', name: 'Crowd keeps it fresh', sourceApp: 'GasBuddy', trick: 'People nearby keep the information up to date because they want it too.', layout: 'map', sample: { title: 'Nearby', greeting: 'Updated 2 min ago', hero_label: 'reports near you', hero_value: '14', primary_action: 'Add an update', cards: [card('Main St', 'Reported by 6 people', 'Now'), card('Oak Park', 'Reported by 3 people', '5 min'), card('Riverside', 'Reported by 2 people', '12 min')], tabs: tabs('Map', 'Feed', 'Saved', 'Profile') } },
  { id: 'streak', name: "Don't break the streak", sourceApp: 'Duolingo', trick: 'A daily streak you really do not want to lose keeps you coming back.', layout: 'streak', sample: { title: 'Today', greeting: 'Keep it going', hero_label: 'day streak', hero_value: '23', primary_action: 'Do today’s', cards: [card('Today’s goal', 'Takes about 5 minutes', 'Due'), card('Best streak', 'Your record so far', '41 days')], tabs: tabs('Today', 'Week', 'Friends', 'Profile') } },
  { id: 'people-map', name: 'See your people on a map', sourceApp: 'Find My', trick: 'The people you care about show up on a map, live.', layout: 'map', sample: { title: 'Your people', greeting: 'Everyone’s nearby', hero_label: 'friends here', hero_value: '3', primary_action: 'Share where I am', cards: [card('Maya', 'By the main stage', '2 min'), card('Jon', 'At the food trucks', '5 min'), card('Ari', 'Heading to the gate', 'Now')], tabs: tabs('Map', 'People', 'Chat', 'Profile') } },
  { id: 'swipe-match', name: 'Swipe to match', sourceApp: 'Tinder', trick: 'Swipe through options; when both sides say yes, it is a match.', layout: 'swipe', sample: { title: 'Discover', greeting: 'New picks today', hero_label: 'Matches today', hero_value: '2', primary_action: 'Keep swiping', cards: [card('Saturday hike', 'Trail run, 6 miles, easy pace', '2 mi away'), card('Board games', 'Thursday night', '1 mi'), card('Pottery class', 'Beginner friendly', '3 mi')], tabs: tabs('Discover', 'Matches', 'Chat', 'Profile') } },
  { id: 'everyone-at-once', name: 'Everyone posts at once', sourceApp: 'BeReal', trick: 'Everyone does the same thing at the same surprise moment, once a day.', layout: 'streak', sample: { title: 'Now', greeting: 'It’s time!', hero_label: 'minutes left to post', hero_value: '1:42', primary_action: 'Post yours', cards: [card('12 friends posted', 'See what everyone’s doing', 'Live'), card('Yesterday', 'Your post got 9 reactions', '9')], tabs: tabs('Now', 'Friends', 'Memories', 'Profile') } },
  { id: 'walk-to-collect', name: 'Walk to real places to collect things', sourceApp: 'Pokémon GO', trick: 'Real places hold things you can only get by actually going there.', layout: 'map', sample: { title: 'Explore', greeting: '3 finds nearby', hero_label: 'collected', hero_value: '27', primary_action: 'Start a walk', cards: [card('Old Library', '400 ft away', 'Rare'), card('Fountain Square', '0.3 mi away', 'New'), card('Hilltop', '0.8 mi away', 'Gold')], tabs: tabs('Explore', 'Collection', 'Friends', 'Profile') } },
  { id: 'point-to-know', name: 'Hold it up to name it', sourceApp: 'Shazam', trick: 'Hold your phone up to something and it tells you exactly what it is, in seconds.', layout: 'list', sample: { title: 'Identify', greeting: 'Point and tap', hero_label: 'Last found', hero_value: 'Japanese Maple', primary_action: 'Hold it up', cards: [card('Monarch butterfly', 'Found in your garden', 'Today'), card('Basil', 'Found at the market', 'Mon'), card('Barn owl call', 'Heard on a walk', 'Sun')], tabs: tabs('Identify', 'History', 'Saved', 'Profile') } },
  { id: 'split-bill', name: 'Split the bill without the math', sourceApp: 'Splitwise', trick: 'Shared costs split themselves fairly, with no awkward math.', layout: 'list', sample: { title: 'Trip to Austin', greeting: '4 people', hero_label: 'You are owed', hero_value: '$46.20', primary_action: 'Add an expense', cards: [card('Dinner at Uchi', 'Paid by you', '$182'), card('Gas', 'Paid by Sam', '$64'), card('Airbnb', 'Paid by Lee', '$540')], tabs: tabs('Trips', 'Activity', 'Friends', 'Profile') } },
  { id: 'highest-bid', name: 'Highest bid wins', sourceApp: 'eBay', trick: 'People bid against each other and the highest bid wins when time runs out.', layout: 'countdown', sample: { title: 'Live', greeting: 'Bidding now', hero_label: 'Ends in', hero_value: '3:18', primary_action: 'Bid $45', cards: [card('Vintage camera', '12 bids', '$42'), card('Signed vinyl', '8 bids', '$65'), card('Road bike', '21 bids', '$210')], tabs: tabs('Live', 'Watching', 'Selling', 'Profile') } },
  { id: 'crowd-votes', name: 'The crowd votes the best to the top', sourceApp: 'Reddit', trick: 'Votes push the best stuff up where everyone sees it.', layout: 'list', sample: { title: 'Top today', greeting: 'Voted by 2.4k people', hero_label: 'Your post is', hero_value: '#3 today', primary_action: 'Post something', cards: [card('Best tacos in town', '412 votes', '▲ 412'), card('Hidden swimming spot', '388 votes', '▲ 388'), card('Free museum days', '251 votes', '▲ 251')], tabs: tabs('Top', 'New', 'Saved', 'Profile') } },
  { id: 'daily-puzzle', name: 'One puzzle a day, same for everyone', sourceApp: 'Wordle', trick: 'One shared daily challenge that everyone gets, once.', layout: 'streak', sample: { title: 'Today’s puzzle', greeting: 'Same for everyone', hero_label: 'solved today', hero_value: '18,402', primary_action: 'Play today’s', cards: [card('Your streak', 'Solved 9 days in a row', '9'), card('Friends', '4 of 6 solved it', '4/6')], tabs: tabs('Today', 'Stats', 'Friends', 'Profile') } },
  { id: 'race-strangers', name: 'Race strangers on the same route', sourceApp: 'Strava', trick: 'Everyone who does the same stretch gets ranked, so you can race people you will never meet.', layout: 'map', sample: { title: 'Segments', greeting: 'Your run today', hero_label: 'on the leaderboard', hero_value: '#12', primary_action: 'Start a run', cards: [card('Hill Climb', 'Your best: 4:12', '#12'), card('River Loop', 'Your best: 18:40', '#31'), card('Bridge Sprint', 'Your best: 1:05', '#7')], tabs: tabs('Map', 'Segments', 'Club', 'Profile') } },
];

export function templateById(id: string | null | undefined): Template | undefined {
  return TEMPLATES.find((template) => template.id === id);
}
