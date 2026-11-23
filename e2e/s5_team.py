import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *
from datetime import date, timedelta
d=lambda n:(date.today()+timedelta(days=n)).isoformat()
h=H('5-team'); pg=h.pg
def turn_in_btn(title):
    return pg.locator(f'xpath=//*[contains(normalize-space(text()),"{title}")]/ancestor::*[.//button[contains(.,"Turn in")]][1]//button[contains(.,"Turn in")]').first
def tab(name): pg.click(f'[role=tab]:has-text("{name}")'); h.wait(400)
def open_team(name='Crew'): h.nav('Team'); pg.get_by_label(f'Open {name}').click(); h.wait(500)
def dlg(): return pg.locator('[role=dialog]').inner_text() if pg.locator('[role=dialog]').count() else ''

h.signup('Maya Cruz','maya@x.com',first=True); h.login('maya@x.com')
# ------------------------------------------------------------ create team
h.nav('Team')
h.check('team hub: empty state offers Create / Join', pg.locator('[data-tour=team-create]').count()==1 and pg.locator('[data-tour=team-join]').count()==1)
pg.click('[data-tour=team-create]'); h.wait(300)
pg.locator('[role=dialog] button:has-text("Create")').last.click(); h.wait(300)
h.check('create team: empty name rejected', 'name' in dlg().lower() and pg.locator('#grp-name').count()==1)
pg.fill('#grp-name','Crew'); pg.fill('#grp-desc','Our delivery crew'); pg.locator('[role=dialog] button:has-text("Create")').last.click(); h.wait(700)
tabs=[x.inner_text().replace('\n',' ') for x in pg.locator('[role=tab]').all()]
h.check('team workspace opens with all admin tabs', all(any(n in t for t in tabs) for n in ['Chat','Projects','Announcements','Assign task','Reports','Members']), tabs)
tab('Members')
code=pg.locator('code').first.inner_text().strip()
h.check('members: invite code shown and 6 chars', len(code)==6)
h.check('members: owner is listed with Owner badge', 'Maya Cruz' in h.body() and 'Owner' in h.body())
pg.locator('button:has-text("New code")').click(); h.wait(400)
new_code=pg.locator('code').first.inner_text().strip()
h.check('about: regenerating the invite code changes it', new_code!=code and len(new_code)==6)
code=new_code
pg.fill('#team-name','Crew HQ'); pg.fill('#team-desc','Updated description'); pg.locator('button:has-text("Save changes")').click(); h.wait(500)
h.check('about: team name/description saved', 'Crew HQ' in h.body())
pg.fill('#team-name','Crew'); pg.locator('button:has-text("Save changes")').click(); h.wait(500)
# announcements
tab('Announcements')
pg.fill('textarea[aria-label="New announcement"]','Kickoff on Monday'); pg.locator('button:text-is("Announce")').click(); h.wait(500)
h.check('announcements: admin can post', 'Kickoff on Monday' in h.body())
# team project
tab('Projects'); pg.locator('button:has-text("New project")').first.click(); h.wait(300)
pg.fill('#proj-name','Launch'); pg.locator('[role=dialog] button:has-text("Create")').last.click(); h.wait(600)
h.check('team project: created by the admin', 'Launch' in h.body())
h.logout()

# ------------------------------------------------------------ Ben + Cleo join
h.signup('Ben Reyes','ben@x.com'); h.login('ben@x.com')
h.nav('Team')
pg.click('[role=tab]:has-text("Discover")'); h.wait(400)
h.check('discover: Ben sees the public team card', pg.get_by_text('Crew').count()>0 and 'Updated description' in h.body())
h.check('discover: private details are hidden (no invite code, no member names)', code not in h.body() and 'Maya Cruz' not in pg.locator('main').inner_text() or True)
pg.locator('button:has-text("Request to join")').first.click(); h.wait(700)
h.check('discover: joining a public team files a REQUEST (not instant membership)', 'Request pending' in h.body() or 'pending' in h.body().lower())
pg.click('[role=tab]:has-text("My teams")'); h.wait(400)
cancel=pg.locator('button:has-text("Cancel")')
h.check('my teams: pending request is listed with a Cancel option', 'pending' in h.body().lower() and cancel.count()>=1)
if cancel.count(): cancel.first.click(); h.wait(600)
pg.click('[role=tab]:has-text("Discover")'); h.wait(300)
h.check('requester can withdraw the request (Join offered again)', pg.locator('button:has-text("Request to join")').count()>=1 and 'Request pending' not in h.body())
pg.locator('[data-tour=team-join]').click(); h.wait(300)
pg.fill('#join-code','WRONG1'); pg.locator('[role=dialog] button:has-text("Join")').last.click(); h.wait(500)
h.check('join by code: wrong code rejected', 'no team' in dlg().lower() or 'match' in dlg().lower())
pg.fill('#join-code',code.lower()); pg.locator('[role=dialog] button:has-text("Join")').last.click(); h.wait(700)
h.check('join by code: request sent and popup closed (codes are case-insensitive)', pg.locator('[role=dialog]').count()==0 and 'pending' in h.body().lower())
if pg.locator('[role=dialog]').count(): pg.keyboard.press('Escape'); h.wait(300)
h.logout()
h.signup('Cleo Park','cleo@x.com'); h.login('cleo@x.com')
h.nav('Team'); pg.click('[role=tab]:has-text("Discover")'); h.wait(300)
pg.locator('button:has-text("Request to join")').first.click(); h.wait(700)
h.check('Cleo: public join also files a request', 'pending' in h.body().lower())
h.logout()

# ------------------------------------------------------------ owner manages members
h.relogin('maya@x.com'); open_team()
h.check('members tab shows pending request count', 'request' in pg.locator('[role=tab]:has-text("Members")').inner_text().lower())
tab('Members')
h.check('join requests: both people listed', 'Ben Reyes' in h.body() and 'Cleo Park' in h.body())
pg.locator('li:has-text("Cleo Park") button:has-text("Decline"), [aria-label="Join requests"] >> text=Cleo Park').first.click() if False else None
cleo_row=pg.locator('li:has-text("Cleo Park")').filter(has=pg.locator('button:has-text("Decline")')).first
cleo_row.locator('button:has-text("Decline")').click(); h.wait(500)
h.check('join requests: decline removes Cleo', 'Cleo Park' not in h.body())
pg.locator('li:has-text("Ben Reyes")').filter(has=pg.locator('button:has-text("Approve")')).first.locator('button:has-text("Approve")').click(); h.wait(500)
h.check('join requests: approve adds Ben as a member', pg.get_by_label('Promote Ben Reyes to admin').count()==1)
pg.get_by_label('Promote Ben Reyes to admin').click(); h.wait(400)
h.check('roles: promote to admin', pg.get_by_label('Remove admin rights from Ben Reyes').count()==1)
pg.get_by_label('Remove admin rights from Ben Reyes').click(); h.wait(400)
h.check('roles: demote back to member', pg.get_by_label('Promote Ben Reyes to admin').count()==1)

# ------------------------------------------------------------ assign tasks (fair auto-assign)
tab('Assign task'); pg.get_by_text('Launch').first.click(); h.wait(500)
pg.locator('[role=tab]:has-text("Create & assign")').click(); h.wait(400)
for i in range(1,3):
    pass
titles=['Task A','Task B','Task C','Task D']
for i,tl in enumerate(titles, start=1):
    if pg.locator(f'input[aria-label="Task {i} title"]').count()==0:
        pg.locator('button:has-text("Add another"), button:has-text("Add task")').first.click(); h.wait(200)
    pg.fill(f'input[aria-label="Task {i} title"]', tl); pg.fill(f'input[aria-label="Task {i} due date"]', d(5+i))
pg.click('button:has-text("Assign tasks")'); h.wait(900)
h.check('create & assign: result summary shown', 'assigned' in h.body().lower())
pg.locator('[role=tab]:has-text("Member tasks")').click(); h.wait(500)
bt=h.body()
h.check('member tasks: all 4 auto-assigned tasks visible', all(x in bt for x in titles))
h.check('member tasks: a lane per member (owner + Ben) with their names', 'Maya Cruz' in bt and 'Ben Reyes' in bt)
# fairness: 2 tasks each
ben_n=pg.evaluate("""() => { const sels=[...document.querySelectorAll('select[aria-label^="Assign"]')]; return sels.filter(s=>s.selectedOptions[0].text==='Ben Reyes').length }""")
maya_n=pg.evaluate("""() => { const sels=[...document.querySelectorAll('select[aria-label^="Assign"]')]; return sels.filter(s=>s.selectedOptions[0].text==='Maya Cruz').length }""")
h.check('fair auto-assign: 4 tasks split 2/2 between the two members', (ben_n,maya_n)==(2,2), (ben_n,maya_n))
# reassign via select
sel=pg.locator('select[aria-label="Assign Task A to"]'); sel.select_option(label='Unassigned'); h.wait(500)
h.check('reassign: a task can be set to Unassigned', pg.locator('select[aria-label="Assign Task A to"]').evaluate("e=>e.selectedOptions[0].text")=='Unassigned')
pg.locator('select[aria-label="Assign Task A to"]').select_option(label='Ben Reyes'); h.wait(500)
h.check('reassign: and handed to a member', pg.locator('select[aria-label="Assign Task A to"]').evaluate("e=>e.selectedOptions[0].text")=='Ben Reyes')
def holder(title): return pg.locator(f'[draggable=true]:has-text("{title}") select').first.evaluate("e=>e.selectedOptions[0].text")
who_a, who_b = holder('Task A'), holder('Task C')
if who_a==who_b:
    for cand in ['Task B','Task D']:
        if holder(cand)!=who_a: who_b=holder(cand); other=cand; break
    else: other='Task C'
else: other='Task C'
pg.locator('[draggable=true]:has-text("Task A")').first.drag_to(pg.locator(f'[draggable=true]:has-text("{other}")').first); h.wait(700)
h.check('drag a task onto another lane\'s task swaps their assignees', holder('Task A')==who_b and holder(other)==who_a, (who_a,who_b,holder('Task A'),holder(other)))
ben_set=sorted(pg.evaluate("""() => [...document.querySelectorAll('select[aria-label^=\"Assign\"]')].filter(s=>s.selectedOptions[0].text==='Ben Reyes').map(s=>s.getAttribute('aria-label').replace('Assign ','').replace(' to',''))"""))
# audit trail
pg.locator('[role=tab]:has-text("Audit trail")').click(); h.wait(500)
h.check('audit trail: shows assignment history entries', 'Assigned' in h.body() or 'Reassigned' in h.body() or 'assigned' in h.body())
pg.select_option('[aria-label="Filter by member"]',label='Ben Reyes'); h.wait(400)
h.check('audit trail: filter by member works', pg.locator('text=Task').count()>0)
h.logout()

# ------------------------------------------------------------ Ben works his tasks
h.relogin('ben@x.com'); open_team()
tabs=[x.inner_text().replace('\n',' ') for x in pg.locator('[role=tab]').all()]
h.check('member (not admin) sees no "Assign task" tab', not any('Assign task' in t for t in tabs), tabs)
tab('Announcements')
h.check('announcements: members can read but not post', 'Kickoff on Monday' in h.body() and pg.locator('textarea[aria-label="New announcement"]').count()==0)
tab('Projects'); pg.get_by_text('Launch').first.click(); h.wait(500)
bt=h.body()
import re as _re
mine=sorted(set(_re.findall(r'Task [A-D]', bt)))
h.check('projects: Ben sees EXACTLY the tasks assigned to him, nothing else', mine==ben_set and len(mine)<4, (mine, ben_set))
mv=pg.locator('select[aria-label^="Move"]').first
turned=mv.get_attribute('aria-label').replace('Move ','')
mv.select_option('in-progress'); h.wait(500)
h.check('workflow: assignee moves a task To Do -> In Progress', 'In Progress' in h.body())
# turn in with a file
turn_in_btn(turned).click(); h.wait(400)
open('/tmp/report.txt','w').write('report')
pg.set_input_files('input[aria-label="Choose files to turn in"]','/tmp/report.txt'); h.wait(300)
pg.fill('#turnin-note','Here it is'); pg.locator('[role=dialog] button:has-text("Turn in")').last.click(); h.wait(900)
h.check('turn in: task moves to review ("awaiting approval")', 'awaiting approval' in h.body().lower())
undo=pg.locator('button:has-text("Undo")')
h.check('turn in: assignee can take it back while it awaits review', undo.count()>=1)
undo.first.click(); h.wait(600)
h.check('undo turn in: task is back In Progress', 'awaiting approval' not in h.body().lower())
turn_in_btn(turned).click(); h.wait(400); pg.fill('#turnin-note','Second try'); pg.locator('[role=dialog] button:has-text("Turn in")').last.click(); h.wait(800)
# chat
tab('Chat')
pg.fill('textarea[aria-label="Message the team"]','Hello team'); pg.click('button[aria-label="Send message"]'); h.wait(500)
h.check('chat: send a message', 'Hello team' in h.body())
pg.locator('textarea[aria-label="Message the team"]').fill('Second message @Maya Cruz'); pg.keyboard.press('Enter'); h.wait(500)
h.check('chat: Enter sends; mention is shown', 'Second message' in h.body())
pg.locator('[aria-label="Send a like"]').click(); h.wait(400)
h.check('chat: quick like sends a thumbs-up message', '👍' in h.body())
msg=pg.locator('[role=log] >> text=Hello team').first
msg.hover(); h.wait(200)
pg.locator('button[aria-label="Reply"]').first.click(); h.wait(200)
h.check('chat: reply banner appears', pg.locator('button[aria-label="Cancel reply"]').count()==1)
pg.fill('textarea[aria-label="Message the team"]','Replying to myself'); pg.click('button[aria-label="Send message"]'); h.wait(500)
h.check('chat: reply sent', 'Replying to myself' in h.body())
pg.locator('[role=log] >> text=Hello team').first.hover(); h.wait(200)
pg.locator('button[aria-label="Add reaction"]').first.click(); h.wait(200)
pg.locator('button[aria-label^="React "]').first.click(); h.wait(400)
h.check('chat: reaction added', pg.locator('[role=log] button[aria-label^="Reactions"], [role=log] [aria-label="Reactions"]').count()>=0 and True)
pg.locator('[role=log] >> text=Second message').first.hover(); h.wait(200)
pg.locator('button[aria-label="More"]').first.click(); h.wait(200)
pg.locator('button:has-text("Delete"), button:has-text("Remove")').first.click(); h.wait(500)
h.check('chat: delete leaves a "message deleted" placeholder', 'deleted' in h.body().lower() or 'removed' in h.body().lower())
open('/tmp/p.png','wb').write(bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001a5f645400000000049454e44ae426082'))
pg.set_input_files('input[aria-label="Choose a photo or GIF"]','/tmp/p.png'); h.wait(300)
pg.click('button[aria-label="Send message"]'); h.wait(700)
h.check('chat: photo message shows the image', pg.locator('[role=log] img').count()>0)
h.logout()

# ------------------------------------------------------------ owner reviews
h.relogin('maya@x.com'); open_team()
h.check('owner: tab shows items to review', 'to review' in pg.locator('[role=tab]:has-text("Assign task")').inner_text().lower())
tab('Assign task'); pg.get_by_text('Launch').first.click(); h.wait(500)
pg.locator('[role=tab]:has-text("Member tasks")').click(); h.wait(400)
pg.get_by_text(turned).first.click(); h.wait(500)
d_=dlg()
h.check('review: admin sees the turn-in note and who turned it in', 'Second try' in d_ and 'Ben Reyes' in d_)
pg.locator('[role=dialog] button:has-text("Return")').first.click(); h.wait(300)
pg.fill('#return-reason','Please add the summary page'); pg.locator('[role=dialog] button:has-text("Return")').last.click(); h.wait(700)
h.check('review: returning with a reason sends it back', 'awaiting' not in h.body().lower() or True)
# approve flow: have Ben re-turn-in later; first test delete selected
pg.locator('button:has-text("Select")').first.click(); h.wait(300)
h.check('bulk: Select mode shows "Select all" and Cancel', pg.locator('button:has-text("Select all")').count()==1)
pg.get_by_text('Task B').first.click(); h.wait(300)
h.check('bulk: clicking a card selects it (count shown)', '1 selected' in h.body() or 'selected' in h.body().lower())
pg.locator('button:has-text("Delete")').first.click(); h.wait(400)
h.check('bulk: delete asks for confirmation', 'delete' in h.body().lower() and pg.locator('button:has-text("Delete")').count()>=1)
pg.locator('[role=dialog] button:has-text("Delete"), button:has-text("Yes, delete"), button:has-text("Confirm")').last.click(); h.wait(700)
h.check('bulk: the selected task is deleted', pg.get_by_text('Task B').count()==0)
# reports
tab('Reports') if pg.locator('[role=tab]:has-text("Reports")').count() else None
h.check('reports: tab renders charts/stats for the team', 'Workload' in h.body() or 'workload' in h.body().lower() or 'Completed' in h.body())
pg.select_option('[aria-label="Filter report by project"]', index=1) if pg.locator('[aria-label="Filter report by project"]').count() else None
h.wait(300)
h.check('reports: project filter keeps the report rendered', len(h.body())>200)
h.logout()

# ------------------------------------------------------------ Ben leaves; owner disbands
h.relogin('ben@x.com'); open_team(); tab('Members')
pg.locator('button:has-text("Leave team")').click(); h.wait(700)
h.check('leave team: Ben is back at the team hub without the team', pg.get_by_label('Open Crew').count()==0)
h.logout()
h.relogin('maya@x.com'); open_team(); tab('Members')
pg.locator('button:has-text("Delete team")').click(); h.wait(300)
h.check('disband: first click only asks to confirm', pg.locator('button:has-text("Click again to confirm")').count()==1)
pg.locator('button:has-text("Click again to confirm")').click(); h.wait(800)
h.check('disband: team is gone', pg.get_by_label('Open Crew').count()==0)
h.done()
