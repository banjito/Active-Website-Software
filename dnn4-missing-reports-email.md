# Draft email: DNN4 missing reports

**Subject:** DNN4 missing reports, what happened and where we landed

---

Hi [name],

Thanks for putting that list together. It took me a while to get to the bottom of it, and I want to give you the straight version rather than a summary that makes it sound better than it is.

**What happened**

When a tech fills out a report, the app saves it in two pieces. First the test data, then a small second record that makes the report show up on the job. If that second piece failed, the app carried on as if nothing was wrong. The data sat in the database, complete, but invisible to everyone. Nothing on screen told the tech, and nothing told us.

It got worse with the "Save & New" button. That one saved the report and then jumped straight to the next blank form without waiting for the save to finish. Moving to the next page cancelled whatever was still in flight. You can see it in the timestamps: each lost report was created at the exact second the previous one was last saved. That is a tech working down a row of panels, losing one here and there and having no way to know.

**Where your 46 landed**

Twelve of them were never actually missing. They are in the system, just written as "Main 1" and "Main 2" where your list says "MCB1" and "MCB2", so they did not match when you went looking. My fault for letting two naming conventions exist at once.

Three were the real thing. Complete tests with serial numbers and readings, saved but invisible. Those are recovered and showing on the job now.

That leaves 31. I went through every table in the database, every storage bucket, every published PDF, and the row-level archive. For 24 of them there is no trace anywhere, on any job. They were never written. Not deleted, never saved in the first place. Those need to be retested and I do not see a way around it.

The remaining 7 are the switchboard ones. I have not been able to verify those yet because of a permissions issue on my side with those particular tables. I am not going to tell you they are gone until I have actually looked. I will confirm either way this week before anyone books a trip.

While I was in there I also found 33 stranded reports on DNN4 that were not on your list at all, mostly B side work from late July, plus 8 more across other jobs. All recovered. So the list was real but it was not the whole picture.

**What I have changed**

The silent failure is gone. Saving now retries on its own, and if a report ever does lose its link, it repairs itself the next time someone opens and saves it.

The Save & New bug is fixed, and I checked every other report type for the same pattern.

Techs now get told. If a save stops going through, a red bar appears across the top of the report saying "Not saved" with the time of the last good save, the save icon turns red, and the browser stops them if they try to close the tab. Previously they got a green icon and silence, no matter what was going wrong.

I also built a sweep that finds stranded reports automatically so we are never relying on someone noticing a gap in a spreadsheet a month later.

**What I need from you**

Two things. First, can you confirm the 24 for retest so I can get them scheduled. Second, can we agree on one way to write these, MCB or Main, and I will make the app enforce it. Twelve of the 46 were a false alarm caused purely by that, and it cost us both time.

I am sorry this landed on you as a pile of missing paperwork. It was a real bug and it had been quietly running since at least May. It is fixed now, and more to the point, if it ever happens again someone will see it the same day instead of a month later.

Jack
