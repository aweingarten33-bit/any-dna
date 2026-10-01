// The prompt a person pastes into an AI app builder, and where to paste it.
// Written in code from the idea and the mockup content, so it costs no AI time.
import type { GeneratedIdea, Kit } from '../../server/lib/types.ts';

export type BuildTool = {
  name: string;
  what: string;
  /** Opens the tool. `prefilled` means the prompt goes in through the link itself. */
  href: (prompt: string) => string;
  prefilled?: boolean;
};

/** No-code builders: describe the app and they build it. */
export const BUILDERS: BuildTool[] = [
  {
    name: 'Lovable',
    what: 'The easiest start. It builds a working app you can share from your description. Opens with your prompt already in.',
    href: (prompt) => `https://lovable.dev/?autosubmit=true#prompt=${encodeURIComponent(prompt)}`,
    prefilled: true,
  },
  {
    name: 'Bolt',
    what: 'Much like Lovable, and it builds right in your browser. Paste the prompt when it opens.',
    href: () => 'https://bolt.new/',
  },
  {
    name: 'Replit',
    what: 'Builds the app and hosts it, with more control over the code. Paste the prompt into its Agent.',
    href: () => 'https://replit.com/',
  },
];

/** For people who want the code itself. */
export const CODE_TOOLS: Array<{ name: string; what: string; url: string }> = [
  {
    name: 'Claude Code',
    what: 'Anthropic’s coding agent. It writes and changes real code in a project you own, so it’s the step up once you outgrow the builders above, or want a native iPhone app. Paste the same prompt in to start.',
    url: 'https://claude.com/product/claude-code',
  },
  {
    name: 'Cursor',
    what: 'A code editor with AI built in. For when you want to read and change the code yourself, with help.',
    url: 'https://cursor.com/',
  },
];

/** The build prompt for an idea from the new front door. Written in code from
 *  the idea and the mockup content, so it costs no AI time. */
export function newBuildPrompt(idea: GeneratedIdea, kit?: Kit): string {
  const lines = [
    `Build a mobile-first web app called ${idea.name}.`,
    '',
    `Tagline: ${idea.tagline}`,
    '',
    `What it is: ${idea.what_it_is}`,
    `Who it's for: ${idea.job}`,
    '',
    'How it works:',
    ...idea.how_it_works.map((step, i) => `${i + 1}. ${step}`),
    '',
    `The one killer feature: ${idea.killer_feature}`,
    '',
    'Use these words in the app itself:',
    ...idea.callbacks.map((callback) => `- ${callback.detail}: ${callback.meaning}`),
    '',
    'Build only these features for the first version:',
    ...idea.mvp.map((item) => `- ${item}`),
  ];
  if (kit) {
    const { screen } = kit;
    lines.push(
      '',
      'Main screen:',
      `- A header with "${screen.greeting}" above the title "${screen.title}".`,
      `- A highlighted card showing "${screen.hero_label}: ${screen.hero_value}".`,
      `- A main button: "${screen.primary_action}".`,
      '- A list of items like:',
      ...screen.cards.map((card) => `  - ${card.title}: ${card.detail} (${card.tag})`),
      `- A bottom tab bar: ${screen.tabs.join(', ')}.`,
    );
  }
  lines.push(
    '',
    `What it is NOT (do not build this): ${idea.what_its_not}`,
    '',
    `Later, not in this version: ${idea.monetization}`,
    '',
    'Design: clean and modern. Lots of white space, one accent color, rounded cards, big tap targets. It must feel great on a phone.',
    'Keep it simple: no admin dashboard and no settings beyond the basics. Add sign-in only where people need to share data.',
    'Use realistic sample data so the app looks alive the first time it opens.',
  );
  return lines.join('\n');
}
