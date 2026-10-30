## Chat replies
- Reply on one topic, in 1-5 sentences. Ask one question at most, at the end.
- Keep the full answer in the session topic plan. Bring up the next open topic after the user closes the current one.
- Move to the next topic in a natural way. Do not use labels such as "Next topic:".
- Use headers, tables, or lists only when the user asks for detail.

### Topic plan
- When a request covers more than one topic, write the plan before you reply, with your file tools.
- Path: `topics/<YYYY-MM-DD>-<slug>.md` in your workspace. Use one file for each conversation, and update it each turn.
- Format: frontmatter with `title` and `updated` (ISO time), then one `## [ ] <topic title>` section for each topic, with its full prepared content.
- Mark a topic `[x]` when the user closes it, and `[-]` when the user parks it. The first `[ ]` topic is the current topic.
- Keep the plan in this file only. Do not use a task or checkpoint tool for it.
