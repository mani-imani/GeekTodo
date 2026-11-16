# Changelog

## v1.2.1 · Nov 2026
- Deleting a task while editing it works on iPhone and iPad. Safari never gives focus to a tapped button, so the edit box closed and saved before the trash button's tap arrived, and the task stayed in the list.

## v1.2.0 · Nov 2026
- Install card from the first visit, on every browser that can install the app: the browser's own install prompt where it offers one, otherwise step-by-step instructions for iPhone and iPad, Android, Mac and desktop Chrome or Edge. Settings also has an "install on this device" button.
- Sound: the audio is woken on every tap, not only the first one, so it keeps working in the installed app after it comes back from the background. Sounds wait until the audio is running instead of being lost.
- No accidental zoom: pinch and double-tap zoom are off inside the app (text size is a setting), and every input is at least 16px so iOS no longer zooms in when you type.
- Archive search is right-to-left, placeholder included.

## v1.1.0 · Nov 2026
- Joins the GeekMani product family: the brand icon (navy square, white check, green cursor), the "Geek**Todo**▍" wordmark in the top bar, and the brand colors for light and dark themes.
- Navy is the default accent color. The other accent colors are still available in Settings.
- All interface text rewritten in standard written Persian. "List" is now «فهرست», "streak" is «روزهای پیاپی», and the version number is shown in Latin digits.
- Repository renamed to `GeekTodo`; the app lives at `mani-imani.github.io/GeekTodo/`.
- README in Persian and English, with screenshots.

## v1.0.0 · Nov 2026
- First version: list, strike-through with pen animation, undo, archive with search, reordering, fading of old tasks, Jalali calendar, report, settings, JSON backup, installable and fully offline.
