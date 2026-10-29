# Aircon Service Management (Demo) Development Guidelines

## Tech Stack

- Frontend: React + TypeScript
- Backend: ASP.NET Core / C#
- Database: Supabase PostgreSQL
- File storage: Supabase Storage

## Working Style

- Work in small steps and explain the purpose of each step.
- Keep code and explanations clear for a developer learning this project.
- Do not change unrelated files.
- Before adding a dependency, explain why it is needed.
- Never commit passwords, API keys, or other secrets.

## Boss Review and Reversible Improvements

- Prioritize a system the boss can understand and use smoothly during review.
- Inspect candidates and propose a concrete plan before implementing optional features. Do not turn every feature into a toggle.
- Implement one user-confirmed improvement at a time. Let the user review the result before starting the next improvement.
- Keep each change independent and narrowly scoped so it can be adjusted or reverted without affecting other features.
- Consider toggles for suitable optional additions. Disabling an addition must preserve the existing business workflow and access to historical data.
- Simplify UI steps and avoid unnecessary fields or required input.
- Before implementation, explain database, permission, or business workflow changes and any rollback limitations.
- Preserve existing business functions, real records, stored files, and permissions. Feature toggles must never bypass authorization checks.
- Reverting code or disabling a feature must not delete business records or stored files. Explain any separate data recovery work required.
- Do not commit, push, or deploy until the user explicitly authorizes it.
- Candidate proposals and acceptance guidance are in `docs/reversible-improvements.md`; proposals are not implementation approval.

## Project Structure

- `frontend/`: React application
- `backend/`: ASP.NET Core application
- `supabase/`: database migrations and configuration
- `docs/`: project documentation
