# 2026-02-18 Frontend Brutalist Terminal Plan

## Scope
Pages:
- `/` Home + installation guide
- `/leaderboard` public ranking tabs
- `/u/:handle` public profile page
- `/me` personal profile and privacy controls

## Visual Direction
- Brutalist terminal language with high contrast, hard borders, and mono typography.
- Prominent command blocks and copy buttons for installation onboarding.

## Home Install Section
1. `npm i -g agentic-commons`
2. `acommons setup`
3. `acommons stats`

## Components
- `AppLayout`
- `InstallSteps`
- `LeaderboardTabs`
- `Profile settings and usage table`
- shadcn-style primitives (`Button`, `Card`, `Input`, `Textarea`)

## Testing and Acceptance
- Install commands are visible and copyable on homepage.
- Leaderboard supports period switching with correct rank ordering.
- Clicking a user row opens their profile page.
- My profile page updates handle/display name/bio and privacy state.
