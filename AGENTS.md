## Commands
- **Do not run git commands.** The user will.
- **Do NOT RUN npm commands.** The user will.

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


## Code Style Guidelines

### Imports & Formatting
- Use `@/` alias for src imports (e.g., `@/lib/AuthContext`)
- ESLint config allows unused vars and any types
- Use TypeScript with strict mode enabled but `noImplicitAny: false`

### Naming Conventions
- Components: PascalCase (e.g., `OilInspectionReport`)
- Files: kebab-case for utilities, PascalCase for components
- Use semantic class names following Tailwind patterns

### Styling Requirements
- **MANDATORY**: All reports must include comprehensive print CSS (see STYLING_GUIDE.mdc)
- Use Tailwind CSS with dark mode support (`dark:` modifier)
- Brand color: `#f26722` (orange)
- Follow predefined component classes: `.form-input`, `.btn-primary`, `.card`, etc.

### Error Handling
- Use try-catch blocks with proper error logging
- Check for Supabase errors: `if (error) throw error`
- Provide user feedback for failed operations

### Database Patterns
- Use Supabase client for all database operations
- Follow the established table relationships (Jobs→Customers, Opportunities→Customers)
- Use TypeScript interfaces for type safety

### Authentication
- Use `useAuth` hook from `@/lib/AuthContext`
- Protect routes with `RequireAuth` component
- Handle session persistence automatically

### Critical Requirements
- **Print Styles**: Every report component MUST include print CSS that removes dropdown arrows, spin buttons, and provides clean professional output
- **Dark Mode**: All components must support both light and dark themes
- **Type Safety**: Use TypeScript interfaces but `any` is allowed for flexibility
