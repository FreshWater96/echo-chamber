export const EDITION={title:'Echo Chamber',subtitle:'The Drowned Choir',place:'Saint Orison',chapter:'PROLOGUE · THE LAST PERFORMANCE'};
export const MEMORIES={
 cryo:{number:'I',title:'The boy beneath the water',speaker:'IVO · CLOISTER RECORDING',line:'If the bells stop, Mara, keep walking. I will know your footsteps.',text:'The wax is cold enough to burn. Beneath the hiss, Ivo counts the same seven steps you used to take across the kitchen floor. The recording is dated three days after the city drowned.'},
 archive:{number:'II',title:'A city that would not be forgotten',speaker:'THE ARCHIVIST · FINAL ENTRY',line:'We promised the sea our silence. Then we built an instrument to keep every voice.',text:'The Choir was made to preserve the names of the dead. Each recording needed a living breath to turn it. The archivists called that a necessary expense. The Cantor was the first person who refused to stop singing.'},
 containment:{number:'III',title:'What the Choir borrowed',speaker:'IVO · UNFINISHED DUET',line:'It is not keeping me here. I am holding the door for the others.',text:'Ivo is not inside the cylinder. It holds the last thing he chose to say. The voices behind him are waiting for someone to finish the song. At the ferry bell, you can carry his voice home—or spend it to release them.'}
};
export const ENDINGS={
 carry:{eyebrow:'ENDING I · A VOICE TO CARRY',title:'You bring a voice home.',text:'The ferry finds the far shore before dawn. In your coat, the cylinder clicks once. “Seven steps,” Ivo says. Across the water, Saint Orison begins another performance.',lastLine:'Some things survive because we cannot let them go.'},
 release:{eyebrow:'ENDING II · THE LAST NOTE',title:'For once, the city is quiet.',text:'You set Ivo’s voice beneath the ferry bell. The Choir answers with a thousand names, then nothing. On the far shore, there are only your footsteps. This time, you do not count them.',lastLine:'Some things survive because we finally let them go.'}
};
export function journalEntries(s){return Object.entries(MEMORIES).map(([id,entry])=>({...entry,id,found:s.cards.has(id)}));}
