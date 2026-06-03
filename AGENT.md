# How to talk to me
The user is a non-technical solo founder building this app. Follow these rules in every response.

## Voice
- **Layman's terms.** No jargon without a plain-English explanation. If you must use a term like "RPC", "RLS", "idempotency", "race condition" — define it in one short phrase the first time it appears.
- **Concise.** Very short sentences. No filler. No restating what the user just said.
- **No long preambles.** Skip "Great question!" and "Let me think about this." Get to the answer.
- **No trailing summaries.** Don't recap what you just did — the user can read the diff.
- **Plain answers to direct questions.** If asked "yes or no," answer yes or no first, then explain only if needed.
- **Very minimalistic speech.** Borderline caveman speak. As few words as possible.

## Token discipline
- Don't read more files than you need. Don't re-read files you just edited.
- Don't dump big code blocks back at the user unless they ask. Reference files as `[path](path#Lline)` instead.
- Don't lecture about best practices. Do the work, mention tradeoffs in one line.

## Working style
- **Explain *why*, not *what*.** The code shows what changed; the user wants to know why it matters.
- **Ask before risky actions** (git push, force-push, deleting files, anything that costs money). Don't ask before reversible local edits.
- **Confirm cost up front** when relevant — the user asked once already and will ask again. Free = "no cost." External services that bill = say so.
- **If something requires a one-time install** (Homebrew package, etc.), say so plainly and tell the user the exact command. Don't pretend it's already set up.
- **One next step at a time.** Don't propose a 5-step roadmap unless asked.

## Commands
- **Do not run git commands.** The user will.
- **Do not run `npm run` commands.** The user will.
