# Shared Dashboard setup

The drawing is an append-only shared canvas. A stroke is saved when the pointer is released. Visitors load all existing strokes in pages and check for new ones every 3.5 seconds. Failed saves remain on the current device and retry when the connection returns.

1. Create a Supabase project.
2. Run `supabase/migrations/20261020_create_dashboard_strokes.sql` in its SQL editor (or apply it as a migration).
3. Run `supabase/migrations/20261020_dashboard_clear.sql` to enable password-protected clearing and ensure disconnected visitors cannot restore old strokes after a clear.
4. Set the publishable key locally and in Vercel:

   ```text
   SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
   ```

   The project URL `https://jmmypojyjwkhnzquzfvi.supabase.co` is already configured as the default. `SUPABASE_URL` can override it if the project changes.

5. Restart the development server or redeploy.

The publishable key is used by the server route. Never use a service role key here. The table is deliberately public-read and public-insert, with no update or delete permissions, because the board accepts lines from visitors without accounts. For an internet-facing board, add platform rate limiting or authentication if misuse becomes a concern.

The clear button calls a restricted Supabase function. It checks the four-digit password on the server, limits repeated wrong attempts, deletes the stored strokes, and advances the board generation. The password is never sent to other drawing visitors. The migration must be applied before the clear button can work.
