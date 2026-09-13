# Set up your Shared Mail filter

Use Gmail on a **computer**. Get your assigned forwarding address from the administrator first. Each owner performs all Gmail changes in their own account.

The dashboard is public, and matching email text and sender details are visible to anyone. Gmail setup-confirmation messages are excluded. Attachments do not appear on the dashboard.

## Step 1 — Confirm your forwarding address

Already confirmed it? Go straight to Step 2.

1. Open Gmail on a computer, in your own account.
2. Click the gear at the top right, then **See all settings**.
3. Click **Forwarding and POP/IMAP** (or **Forwarding**).
4. Click **Add a forwarding address**. Paste your assigned destination, then click **Next → Proceed → OK**.
5. Tell the administrator that Gmail sent its confirmation to Resend. The administrator will give you Google's confirmation link or code. Open the link yourself, or enter the code in Gmail, to finish verification.
6. Tell the administrator when it succeeds so they can activate your dashboard source.

Keep **Disable forwarding** selected in Gmail's main Forwarding settings. The separate filter below will forward only matching messages. Click **Save Changes** if you changed that setting.

## Step 2 — Enter the streaming words

1. Click **Inbox** on the left to return to your emails.
2. Find the long **Search mail** box across the top. Clear any old search text.
3. At the right end of that box, click the **sliders icon** (three horizontal lines). Gmail calls it **Show search options**.
4. In the box that opens, find the field labeled **Has the words**.
5. Copy the entire line below, including the curly brackets, and paste it into **Has the words**:

```text
{appletv "apple tv" hbo hbomax "hbo max" netflix hulu peacock "paramount+" "paramount plus" "disney+" "disney plus"}
```

6. Leave the other fields, including **From**, **To**, and **Subject**, empty. Leave **Has attachment** unchecked.
7. Click **Search** at the bottom of the box. Look over the matching emails: these are the kinds of new messages the filter will share. If any are unsuitable for the public dashboard, stop and ask the administrator to help narrow the rule.

This rule matches a listed streaming name. **Do not add “verification code” by itself.** Matching streaming messages can include sign-in codes, billing messages, and notices.

## Step 3 — Turn that search into a forwarding filter

1. Click the **sliders icon** in the search bar again.
2. Check that **Has the words** still contains the line from Step 2. Paste it again if the field is empty.
3. Click **Create filter** at the bottom of that box. This opens a list of checkbox actions.
4. Check the box beside **Forward it to**.
5. Open the dropdown beside **Forward it to** and select your verified destination:

Choose the **forwarding address supplied by your administrator**. Each owner has a different address.

6. Leave **all the other action boxes unchecked**, including **Delete it**, **Skip the Inbox**, and **Also apply filter to matching conversations**.
7. Click the **Create filter** button at the bottom. Your filter is now saved.

If **Forward it to** is unavailable or your address is missing, finish Step 1, reload Gmail yourself, and reopen the filter form.

## Step 4 — Test one new email

1. Make sure the administrator has activated your dashboard source.
2. Ask someone using another email address to send you a new message with the subject **Netflix shared inbox test** and the body **Test only**.
3. Open [Shared Mail](https://nr-sbe.github.io/shared-mail-dashboard/) and click **Refresh**. Allow 5–10 minutes for delivery.
4. Check that the test appears under your dashboard label. Tell the administrator whether it arrived.

Old emails do not get imported by this filter. Leave general inbox forwarding disabled; your new filter does the forwarding. The dashboard refreshes every minute while open and removes messages after 72 hours. Originals stay in Gmail.

## Change the words later

1. In Gmail, click the gear → **See all settings**.
2. Click **Filters and Blocked Addresses**.
3. Find the filter containing the streaming words and your forwarding destination, then click **edit** beside it.
4. Change **Has the words**, click **Continue**, and check that **Forward it to** still selects your destination.
5. Click **Update filter**.

To stop sharing new messages, delete this filter on the same settings page. To hide existing dashboard messages immediately, ask the administrator to pause your source.

Google's instructions: [Create a filter](https://support.google.com/mail/answer/6579?hl=en) · [Forward selected messages](https://support.google.com/mail/answer/10957?hl=en).
