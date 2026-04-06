# AGENTS.md

## Build/Lint/Test Commands
- `npm run dev` - Start development server on port 5175
- `npm run build` - Build for production
- `npm run lint` - Run ESLint on TypeScript files
- `npm run preview` - Preview production build
- No formal test framework - use `node test-quick.js` for quick testing

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