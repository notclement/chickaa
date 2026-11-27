import { describe, expect, it } from 'vitest';
import { isReservedUsername } from '../index.ts';

describe('reserved usernames', () => {
  it.each([
    'admin', 'Admin', 'ADMIN', 'adm1n', '4dmin', '@dmin', 'adm!n', 'a_d_m_i_n', 'a.d.m.i.n', 'a-d-m-i-n', 'aadmmin', 'admiin',
    'admn', 'amdin', 'admim', 'addmin', 'sdmin', 'admon', 'adnin', 'xadminx', 'the_admin', 'admin2', 'admin_sg', 'clemadmin',
    'administrator', 'administrat0r', 'adminstrator', 'admnistrator', '4dm1n1str4t0r', 'sysadmin', 'sys_4dmin', 'superuser', 'superadmin',
    'root', 'r00t', 'rootuser', 'sudo', 'mod', 'moderator', 'm0d3rator', 'mods', 'staff', 'staff_ann', 'support', 'supp0rt', 'helpdesk',
    'system', 'syst3m', 'official', '0fficial', 'chickaa', 'chick_aa', 'ch1ckaa', 'chickaa_official', 'chickaa_team', 'team', 'owner',
    'security', 'operator', 'webmaster', 'adm', 'adm_01', 'admn123',
  ])('%s is blocked', (id) => expect(isReservedUsername(id)).toBe(true));

  it.each(['clem', 'clemm', 'alice', 'bob_tan', 'weiling', 'priya.k', 'marcus88', 'darren_lim', 'siti', 'kenji', 'hannah', 'arjun', 'badminton', 'adam', 'madison', 'damien', 'dominic', 'amanda', 'edmund', 'zack'])('%s is allowed', (id) => {
    expect(isReservedUsername(id)).toBe(false);
  });

  // Test report run 3, F3: common names and ordinary words must not be "reserved".
  it.each([
    'benjamin', 'benjamin_tan', 'amin', 'mohd_amin', 'muhammad_amin', 'amina', 'jasmine', 'jasmin', 'yasmin', 'kamini', 'yamini', 'shamini',
    'armin', 'ramin', 'salmin', 'admiral', 'admire', 'admiration', 'modi', 'model', 'modesty', 'teamlee', 'rootbeer', 'supportive', 'sudoku',
    'systematic', 'owners', 'staffy', 'madmen', 'sysy', 'admit_one', 'adamina', 'nadim', 'mandi', 'damian', 'sudirman', 'teo_wei', 'moderna_fan',
  ])('%s is allowed (real name or word)', (id) => expect(isReservedUsername(id)).toBe(false));

  it.each(['adnim', 'adnim_sg', 'mod1', 'mod_sg', 'rootuser', 'teamsupport', 'supportteam', 'staff01', 'owner_sg'])('%s is still blocked', (id) =>
    expect(isReservedUsername(id)).toBe(true),
  );
});
