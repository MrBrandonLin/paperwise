# Paperwise on real websites (2026-10-24)

Setup: a frozen copy of `.output/chrome-mv3` running in headless Chrome (puppeteer-core, 1280×800, normal Chrome user agent). SCAN and FILL were sent through the panel's real `toContent()`. The form map came from the live backend (`POST /form-map`, language `en`, one cold request per site). No form was submitted and only fake values were used.

**How fills were counted:** a fill counts as OK only if Paperwise reported success **and** the page DOM held the value 0.6 s later. A "false success" means Paperwise reported success but the page did not keep the value.

## Summary

| Site | Launcher | Fields scanned | Map (source, cold time) | Fills OK / tried | Verdict |
|---|---|---|---|---|---|
| httpbin.org/forms/post (pizza order) | ✅ 0.1 s, bottom-right, clear of the submit button | 10 (text 2, tel, email, radio 1, checkbox 4, textarea) — all labels meaningful | gemini, 5.1 s | 9/10. The 1 failure was a correct refusal: "7:30 PM" in a time input | **Works fully.** Only catch: the time field needs "19:30" |
| parabank.parasoft.com register | ✅ 0.7 s, bottom-right, clear of Register | 13 (text 10, password 3). SSN and 3 passwords marked sensitive ✓ | gemini, 5.8 s | 6/6, SSN and password values hidden in results ✓ | **Partly.** The sidebar *login* is part of the form: map titled "ParaBank Account Login", first question is the login username |
| selenium.dev web-form | ✅ 0.2–0.5 s, bottom-right | 10 (text 4, password, textarea, select, checkbox 2, radio) | gemini, 3.2 s | 13/14. The 1 failure was a correct refusal: the read-only field | **Partly.** Fill engine is fine, but the labels are meta ("Text input", "Textarea"), so the questions are meaningless |
| demoqa.com practice form (React) | ✅ 1.1–2.3 s, **bottom-left, over the site's left menu** (bottom-right had an ad) | 12 (text 7, radio, checkbox 3, textarea). Date/subjects/state labelled by id. File upload and City not scanned | gemini, 1.7 s | 13/19. **6 false successes** (date of birth, Subjects, State) | **Partly.** Name, email, gender, mobile, hobbies and address work and React picks them up. Date and the react-select fields fail silently |
| formy-project.herokuapp.com/form | ✅ 0.2 s, bottom-right | 8 (text 4, checkbox 3, select). **The 3 radios are missing** | gemini, 5.3 s | 10/10 of what was scanned | **Partly / no.** Education radios unreachable. The "Sex" checkboxes are labelled "checkbox", so Gemini asks "Do you agree to option one?" |
| *extra* globalsqa.com/samplepagetest | ⚠️ 0.9 s, mounted bottom-right but **covered by a Google ad iframe** (elementFromPoint = `IFRAME#aswift_4`) | 11 (text 3, email, select, checkbox 3, radio, textarea 2). Good labels | gemini, 1.5 s | 8/8 | **Partly.** Fills perfectly, but the header search box becomes question 1 ("What would you like to search for?"). Ads cover the launcher |
| *extra* roboform.com/filling-test-all-fields | ✅ 0.5 s, top-right | 40 (text 33, password, select 6). Labels are ids ("02frstname") | gemini, 5.3 s | 10/10 | **Partly.** Fills OK, but **card number and CVC are not marked sensitive** (see bugs) |
| *extra* testpages.eviltester.com basic form | ✅ 0.4 s, top-right | 10. Labels are names; radio options all "radioval" | (skipped) | 4/4 | Not demo-worthy: no labels |
| *extra* demo.automationtesting.in Register | ✅ 2.5 s | 17. Address, email, phone and month are "Unlabeled field" | (skipped) | 6/7. The 1 failure was a correct refusal: "555 0100" vs. the page's tel pattern | Not demo-worthy: labels |
| *extra* practice.expandtesting.com form-validation | ✅ 1.0 s | 4 | (skipped) | 3/4. The 1 failure was a correct refusal: the tel pattern | Works, but too small to impress |

The launcher never overlapped the page's submit button on any site. Placement: bottom-right on most sites, bottom-left on demoqa, top-right on roboform and eviltester.

All Gemini maps were source `gemini` (no fallbacks). First section arrived in 0.9–4 s and the complete map in 1.5–5.8 s. These scans are now in the backend's disk cache, so a repeat should be about 0 ms if the same `server/.cache` is used on stage.

## Per-site notes

### httpbin.org/forms/post — works fully
- **Questions:** "What is your name?", "What pizza size do you want?", "Do you want bacon?", "What is your preferred delivery time?", "If you like, what are your delivery instructions?". Map title "Pizza Order", 4 sections.
- **Fills:** text, tel, email, radio (`pw-size` by value or by label "Large"), checkboxes and textarea all landed in the DOM.
- **Time field:** `pw-delivery` is an `<input type=time>`, but it is scanned as kind **text** and the map gives no format hint. "19:30" fills. **"7:30 PM" → `The page did not accept "7:30 PM"`.** The browser check catches it correctly, but the field would go amber. On stage, say "19:30" or skip this field.
- **Looks:** an unstyled 1990s-looking page. It is honest and readable, but not pretty.

### parabank.parasoft.com/parabank/register.htm — partly
- **Labels:** none of the labels are linked (table layout), so every label is the `name` (e.g. "customer.address.zipCode"). Gemini still wrote good questions: "What is your zip code?", "Please type your Social Security Number in the highlighted box."
- **Sensitive fields:** SSN and passwords are detected. Their FILL results return `value: ""`.
- **Problem: the login box is mapped too.** The sidebar "Customer Login" (`pw-username`, `pw-password`) is in the scan and the map. Map title "ParaBank Account Login", summary "Log in to your online account…", first section "Customer Login". The agent would start by asking for a login username and password. The section title "Signing up is easy!" also appears twice.

### selenium.dev/selenium/web/web-form.html — partly
- **Fill engine:** every fill works, including select by label ("Three" → 3) and checkbox off. The read-only field is refused cleanly ("This field is read-only on the page.").
- **Read-only field still asked:** `pw-my-readonly` is scanned (read-only is not filtered) and gets the question "What is the read-only input value?".
- **Polluted select label:** "Dropdown (select) Open this select menu One Two Three" (the label wraps the select).
- **Radio values both "on":** the two `pw-my-radio` options have no value attribute. The map hint is "one of: on, on". Filling by label ("Default radio") works and checks `my-radio-2`, but the read-back value is "on".
- **Date picker:** `pw-my-date` is a text input that accepts any format.

### demoqa.com/automation-practice-form — partly, with silent failures
- **What works:** first and last name, email, mobile, gender radio and hobbies checkboxes. React state is updated (`__reactProps.value` = "Female"/"Male") and the styled radio shows as selected. The textarea works too.
- **Date of birth (`pw-dateOfBirthInput`, react-datepicker):** only "15 Jan 2000"-style text sticks. "2000-01-15", "2001-03-20" and "March 20, 2001" all returned `ok, filled: true`, but the page reverted to the previous date or today's date ("24 Oct 2026"). **False success.**
- **Subjects (`pw-subjectsInput`) and State (`pw-react-select-3-input`, react-select):** FILL "Maths"/"NCR" returned `ok, filled: true`, but the input is empty and nothing is selected. **False success.** City is disabled, so it is not scanned. Picture (file upload) is not scanned (expected).
- **Labels:** "name@example.com" (placeholder) for email; "dateOfBirthInput" and "subjectsInput" (ids). Gemini guessed sensible questions anyway.
- **Launcher:** at bottom-left (bottom-right had an ad's "Sign up" link). It overlaps the site's left nav ("Interactions", "Book Store Application"). Ads change between loads.

### formy-project.herokuapp.com/form — partly / not
- **Radios missing:** "Highest level of education" (`radio-button-1..3`) has **no `name`**. The scanner skips nameless radios (`scanner.ts`: `if (!input.name …) continue`), so they never appear.
- **Wrong questions for "Sex":** the checkboxes have `aria-label="checkbox"` and their real text ("Male") is a bare text node. Labels come out as "checkbox", and Gemini asks "Do you agree to option one/two/three?", which is **wrong**.
- **Date picker:** labelled "mm/dd/yyyy" (placeholder). It accepts "2000-01-15" as text, so the wrong format goes in silently.
- **Select:** `pw-select-menu` FILL "0" selected the placeholder "Select an option" (value 0) and reported filled. The map hint is "one of: 0, 1, 2, 3, 4" (values, not labels). Filling "0-1" or "5-9" by label works.

### globalsqa.com/samplepagetest — partly
- **Fills:** clean labels and real WordPress widgets. Name, email, website, select, checkboxes, radio (by label "Post Graduate") and comment all fill. Gemini map came in 1.5 s.
- **Search box asked:** the site search `pw-s` is scanned and mapped as question 1, "What would you like to search for?". `isSearchField()` is only used for launcher detection, not to drop fields from the scan or map.
- **Honeypot mapped:** the hidden anti-spam textarea `pw-ak_hp_textarea` is mapped ("Please leave this hidden space blank."). It is hidden, so it should not be asked.
- **Launcher covered by an ad:** the launcher mounted at (924, 627), but an AdSense iframe sits on top. Both use z-index 2147483647, and the ad comes later in the DOM. The page also has a sticky ad bar at the bottom.

### roboform.com/filling-test-all-fields — partly, one real bug
- **Sensitive gap (bug):** `pw-41ccnumber` and `pw-43cvc` are **not marked sensitive**. FILL "4111 1111 1111 1111" returned the full value in the result. The scanner's regex needs word boundaries, and the label falls back to the name "41ccnumber" / "43cvc", which match neither `card number` nor `\bcvc\b`.
- **Map risk doesn't help:** Gemini wrote "Please type your credit card number in the highlighted box" but set **risk "none"**. `validate.ts` and the engine only treat `sensitive` / `risk === 'sensitive'` as private, so a card number spoken aloud would be accepted. The SSN (`61pers_ssn`) is detected correctly.
- **Labels:** all labels are ids, but Gemini reconstructed good questions (title, first/middle/last name, card expiry month/year, birth month/day/year selects).

## Bugs found (most important first)
1. **False success on React widgets.** FILL returns `ok, filled: true` when the page reverts or ignores the value: react-datepicker with a non-matching format, and react-select comboboxes (demoqa). The read-back is synchronous, so it misses React resetting the field a moment later. Re-reading after a tick (or a requestAnimationFrame) would catch it.
2. **Card number and CVC not detected as sensitive** when the label is an id like `41ccnumber` / `43cvc`. The values leave the page in fill results. Gemini's risk was "none" despite its own "please type" question.
3. **Unrelated fields in the map.** Site search boxes (globalsqa, question 1) and sidebar login forms (parabank: title, summary and first questions all about logging in) get mapped.
4. **Nameless radio groups are skipped entirely** (formy).
5. **Weak label fallback.** A generic `aria-label` ("checkbox", "Radio button") or the name/id is used before the visible text next to the field or in the previous table cell. Hits formy, parabank, eviltester, roboform and automationtesting.in.
6. **Read-only fields are scanned and asked** (selenium). Also: `type=time` is scanned as text with no format hint (httpbin), and a select label includes its option texts (selenium).
7. **The launcher can be covered by ads** with the same max z-index (globalsqa). Its corner is also chosen before late ads load (demoqa: bottom-left over the nav menu).

## Recommendation for the live demo
**Use httpbin.org/forms/post (the pizza order form).**
- It is the only site where everything worked end to end. All 10 fields have real labels, the Gemini map is clean ("Pizza Order", "What pizza size do you want?", "Do you want bacon?"), and every kind filled and showed in the DOM: text, tel, email, radio, 4 checkboxes and textarea.
- It has no ads, no login box, no search box and no React widgets that can silently reject a value.
- The launcher sits bottom-right, clear of everything. The map is now cached, so it should appear instantly if the same backend cache is used.
- **Rehearse:** say the delivery time as "19:30", or skip it. "7:30 PM" is rejected by the time input and goes amber.
- **Trade-off:** it looks plain. If a prettier "real site" is wanted, globalsqa.com/samplepagetest is the runner-up, but only if bug 3 (search box asked first) is fixed and the ads don't cover the launcher on the day. Avoid demoqa (silent date/select failures, ads), formy (wrong questions, missing radios) and parabank (login box asked first) until those bugs are fixed.

## Re-test after fixes (fresh build copy, 2026-10-24 18:29)

Same harness as before. Runtime messages were collected in the extension page (`window.__events`), as test-reach does, and the page was checked 1.2 s after each fill. New form maps were requested only where the scan changed: roboform, globalsqa, parabank, formy and selenium (all source `gemini`, 1.1–2.1 s). Artifacts are in `sites2/`.

| Check | Before | After |
|---|---|---|
| roboform card number / CVC sensitive | ✗ not sensitive; FILL returned "4111 1111 1111 1111" | ✅ `pw-41ccnumber`, `pw-43cvc` (and expiry month/year) sensitive; FILL returns `value: ""`. Map risk "sensitive", "Please type…" |
| globalsqa search box | ✗ question 1 | ✅ gone from the scan (10 fields). Map title "Testing Skills Form" |
| globalsqa launcher vs. ad | ✗ AdSense iframe on top | ✅ host is `popover="manual"`, `:popover-open`; `elementFromPoint` = paperwise-ui at all 3 test points (3 iframes on the page) |
| parabank sidebar login | ✗ mapped first ("ParaBank Account Login") | ✅ gone (11 fields). Labels now "First Name:", "SSN:"… Title "Online Account Signup". Section "Signing up is easy!" still listed twice |
| formy checkbox labels | ✗ "checkbox" → "Do you agree to option one?" | ✅ "Male" / "Female" / "Prefer not to say" → "Do you identify as male?" |
| formy radios (no name) | ✗ missing | ✗ still missing (known) |
| selenium select label | ✗ included option texts | ✅ "Dropdown (select)" |
| selenium read-only field | ✗ scanned and asked | ✅ skipped |
| selenium radios without value | ✗ options "on / on" | ⚠️ options now "Checked radio / Default radio" and fill by label works (`my-radio-2` checked), **but the FILL result value is still "on"**: `fillRadio` / `readValue` return `radio.value` |
| demoqa launcher position | ✗ bottom-left over the nav menu | ✅ compact pill bottom-right over the footer, clear of the menu and form |
| demoqa reverted date → panel learns | ✗ silent false success | ❌ **still no EVENT_USER_EDIT** within 1.2 s. "2001-03-20" → page shows "24 Oct 2026"; Subjects "Maths" → empty. A real typed edit on the same page does arrive (`EVENT_USER_EDIT pw-lastName "X"`), so the capture works |
| httpbin | 9/10 | ✅ 7/7 tried (text, tel, email, radio, checkbox, time "19:30", textarea) |
| ads covering the launcher (all sites) | globalsqa covered | ✅ paperwise-ui on top everywhere |

**Why the revert fix doesn't fire:** in `filler.ts`, `verifyLater()` dispatches `new Event('change')`. That event is synthetic (`isTrusted === false`), and `watchers.ts` `onEvent` treats `!e.isTrusted || isWriting()` as "our own write": it only updates `lastSent` and never reports. So the re-check is swallowed. Fix: have `verifyLater` call the watcher's report path directly (e.g. an exported `reportNow(id)`), or let it bypass the `isTrusted` filter (for example with a marker on the event).

**Other leftovers:**
- The hidden honeypot `pw-ak_hp_textarea` (globalsqa) is still mapped. It is hidden, so it shouldn't be asked.
- demoqa labels are unchanged ("dateOfBirthInput", "subjectsInput", "react-select-3-input"). Its labels aren't linked to the inputs.
- Note: after the ~4 s wait, the "Form detected" pop-up had collapsed to the compact pill (152×56). On globalsqa that pill sits middle-right, over the sidebar's "INTERACTION" heading.

**Recommendation unchanged:** httpbin.org/forms/post is the safest demo. parabank is now a good second choice: a realistic bank signup, clean labels and questions, the SSN and passwords handled as "type it yourself", no login box. It's a nice way to show the sensitive-field handling. Its only cosmetic issue is the duplicate section title.
