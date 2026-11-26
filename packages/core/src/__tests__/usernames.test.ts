import { describe, expect, it } from 'vitest';
import { isReservedUsername } from '../index.ts';

describe('reserved usernames', () => {
  it.each([
    'admin', 'Admin', 'ADMIN', 'adm1n', '4dmin', '@dmin', 'adm!n', 'a_d_m_i_n', 'a.d.m.i.n', 'a-d-m-i-n', 'aadmmin', 'admiin',
    'admn', 'amdin', 'admim', 'addmin', 'sdmin', 'admon', 'adnin', 'xadminx', 'the_admin', 'admin2', 'admin_sg', 'clemadmin',
    'administrator', 'administrat0r', 'adminstrator', 'admnistrator', '4dm1n1str4t0r', 'sysadmin', 'sys_4dmin', 'superuser', 'superadmin',
    'root', 'r00t', 'rootuser', 'sudo', 'mod', 'moderator', 'm0d3rator', 'mods', 'staff', 'staff_ann', 'support', 'supp0rt', 'helpdesk',
    'system', 'syst3m', 'official', '0fficial', 'nochickencall', 'n0chickencall', 'chickaa', 'chick_aa', 'ch1ckaa', 'chickaa_official', 'nochicken', 'ncc', 'ncc_team', 'team', 'owner',
    'security', 'operator', 'webmaster', 'adm', 'adm_01', 'admn123',
  ])('%s is blocked', (id) => expect(isReservedUsername(id)).toBe(true));

  it.each(['clem', 'clemm', 'alice', 'bob_tan', 'weiling', 'priya.k', 'marcus88', 'darren_lim', 'siti', 'kenji', 'hannah', 'arjun', 'badminton', 'adam', 'madison', 'damien', 'dominic', 'amanda', 'edmund', 'zack'])('%s is allowed', (id) => {
    expect(isReservedUsername(id)).toBe(false);
  });

  it('accepts that a few real words starting with "adm" are blocked (admire, admiral): safer than letting look-alikes through', () => {
    expect(isReservedUsername('admiral')).toBe(true);
  });
});
