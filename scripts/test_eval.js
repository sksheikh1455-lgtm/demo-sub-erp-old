import { create } from 'zustand';

const docSalesperson = '';
const entry = { preparedBy: '' };
const usr = { username: 'nayem Ur Rahman' };
console.log((docSalesperson || entry.preparedBy || usr?.username || '---').split(' ')[0]);

const entry2 = { preparedBy: 'System' };
console.log((docSalesperson || entry2.preparedBy || usr?.username || '---').split(' ')[0]);
