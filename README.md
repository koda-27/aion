# Aion

Descend into a dungeon that is still being made.

Aion is a turn-based roguelike where an unseen Oracle changes the world as you
play. Passages open, creatures acquire strange habits, and familiar tools find
new purposes. What waits on the next floor may not have existed when you entered.

Your terminal coding agent plays the Oracle, writing those changes into the game
while you explore. They arrive without a page refresh or a new run.

## Enter the dungeon

You'll need **Node.js 22+**, **Git**, a browser, and your own terminal coding agent.

```sh
git clone https://github.com/koda-27/aion.git
cd aion
```

Open your coding agent in the folder and tell it:

> Read PLAY.md and start Aion.

It will give you a local browser link and ask you to say **go**. Reply, open the
link, and play. Leave the agent running beside the game. Press **Q**, then
**Enter**, to save and quit.

The game and your saves stay on your machine. The Oracle uses your coding agent's
normal model provider and usage; Aion doesn't bundle an agent or require another
API key.

## Light, stone, and uncertain gifts

Your lantern keeps some things away and draws others close. Oil can light a
brazier or lay a trail of fire. Silver buys a hungry creature's attention.
Sometimes covering your lamp and listening tells you more than looking.

At a shrine, write a petition to the Oracle. Each shrine will bear your words
only once. He may be generous. He may find you unworthy. He may grant exactly
what you asked, with consequences you neglected to consider.

## Controls

| Action | Key |
| --- | --- |
| Move / strike | Arrows or WASD |
| Move diagonally | Y U B N |
| Wait / listen | Space or . |
| Interact / descend / petition | E |
| Cover or uncover lantern | L |
| Drink healing draught | H |
| Smoke | C |
| Throw knife | F, then direction |
| Pour oil | O, then direction |
| Cast silver | T, then direction |
| Wear or remove mail | V |
| Examine | X, then direction; Escape returns |
| Help / sound / fullscreen | ? / M / Enter |
| Save and quit | Q, then Enter |

Click nearby visible tiles to examine them. Check **?** as new interactions arrive.
**History** lets you look back through the changes that shaped your dungeon.

## Return another day

Your descent is saved locally. Open the same folder and ask your agent to start
Aion again to continue. Death ends a witness, not the world: another may enter
the dungeon you and the Oracle have shaped.

You can also play the current dungeon without a live Oracle:

```sh
npm ci
npm start
```

Built with JavaScript, rot.js, Canvas 2D and Web Audio. MIT licensed.
