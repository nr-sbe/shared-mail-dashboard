# Choose which Gmail messages appear on Shared Mail

You only need Gmail and the forwarding address supplied by your administrator. You do not need GitHub, Resend, or Cloudflare accounts.

Selected messages will be readable by anyone with access to the public site. Your other emails stay in your inbox. Attachments are not shown on the dashboard, although Gmail sends them along with the forwarded email to the receiving service.

## First-time setup

1. Open Gmail on a computer. Select the gear → **See all settings**.
2. Open **Forwarding and POP/IMAP** (it may be named **Forwarding**).
3. Select **Add a forwarding address** and paste the address your administrator gave you.
4. Confirm the address. Gmail sends a verification message to the administrator's receiving service.
5. Ask the administrator for the confirmation code, enter it in Gmail, and verify. The administrator then activates your source.
6. Leave general **automatic forwarding disabled**. The filter in the next section will forward only matching messages.

## Add a filter

1. In Gmail's search bar, select **Show search options**.
2. Enter the conditions you want. For example, put the usual sender in **From** and `delivery update` in **Subject**.
3. Select **Search** first to check that the results are the emails you intend to share.
4. Reopen search options and select **Create filter**.
5. Check **Forward it to**, then choose your assigned forwarding address.
6. Leave **Delete it** and **Skip the Inbox** unchecked if you want the original to remain in your inbox.
7. Select **Create filter**. Forwarding applies to new matching mail; this does not import your old inbox.

Gmail combines different fields, such as sender and subject, as conditions that must both match. To match either of two subject words, use a Gmail search such as `subject:(delivery OR schedule)`. Test the search before saving it. Avoid broad words that appear in unrelated messages.

## Change what gets shared

Open Settings → **See all settings** → **Filters and Blocked Addresses**. Find your forwarding filter, select **edit**, change the conditions, and select **Continue** → **Update filter**. Check that **Forward it to** still has your assigned address.

No website changes or administrator assistance are needed for normal keyword changes. Existing dashboard messages stay visible until their three-day expiry; changing a filter only changes future forwarding.

## Stop forwarding

In **Filters and Blocked Addresses**, delete the relevant forwarding filter or edit it to uncheck **Forward it to**. This does not delete your original emails. Ask the administrator to pause your source if you also want its existing messages hidden immediately.

## Check it works

Arrange a new message from another address that matches your filter. It should appear on Shared Mail within 5–10 minutes under normal conditions. Try **Refresh** if needed. Refresh checks messages already received by the site; it cannot make Gmail deliver a message sooner.

If a message is missing, check the filter conditions, forwarding verification, and Gmail's Spam folder. Gmail does not automatically forward spam. If Gmail disables forwarding or an organization policy blocks it, ask the account administrator.

Official reference: [Automatically forward Gmail messages](https://support.google.com/mail/answer/10957?hl=en).
