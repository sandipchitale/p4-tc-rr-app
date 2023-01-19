/* eslint-disable quote-props */
/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable max-len */

import { Component, NgZone, OnInit } from '@angular/core';
import { ElectronService } from './core/services';
import { TranslateService } from '@ngx-translate/core';

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';

const PERFORCE_PROJECT_TO_TEAMCITY_PROJECT_ID_MAP = {
  '/Main/Clients/webapp/infoarchiveng': 'InfoArchive_Main_Iawa',
  '/rel_IA_21.4/Clients/webapp/infoarchiveng': 'InfoArchive_214',
  '/rel_IA_21.2/Clients/webapp/infoarchiveng': 'InfoArchive_212',
  '/rel_IA_20.4/Clients/webapp/infoarchiveng': 'InfoArchive_204',
  '/rel_IA_20.2/Clients/webapp/infoarchiveng': 'InfoArchive_202',
  // '/Main/Servre': 'InfoArchive_Main_IaServer',
  // '/rel_IA_21.4/Server': 'InfoArchive_214_IaServer',
  // '/rel_IA_21.2/Server': 'InfoArchive_212_IaServer',
  // '/rel_IA_20.4/Server': 'InfoArchive_204_IaServer',
  // '/rel_IA_20.2/Server': 'InfoArchive_202_IaServer',
  // // '/Main/Tools/': 'InfoArchive_Main_IaServer',
  // // '/rel_IA_21.4/Tools/': 'InfoArchive_214_IaServer',
  // // '/rel_IA_21.2/Tools/': 'InfoArchive_212_IaServer',
  // // '/rel_IA_20.4/Tools/': 'InfoArchive_204_IaServer',
};

const PERFORCE_BRANCH_TO_TEAMCITY_PROJECT_ID_MAP = {
  'Main':           'InfoArchive_Main',
	'rel_IA_21.4':    'InfoArchive_214',
	'rel_IA_21.2':    'InfoArchive_212',
	'rel_IA_20.4':    'InfoArchive_204',
	'rel_IA_20.2':    'InfoArchive_202',
	'rel_IA_16EP7':   'InfoArchive_16ep7',
	'rel_IA_16EP5.1': 'InfoArchive_16ep51',
	'rel_IA_16EP5':   'InfoArchive_165'
};

const ADD_OPENS= [
  '--add-opens java.base/java.io=ALL-UNNAMED',
  '--add-opens java.base/java.lang=ALL-UNNAMED',
  '--add-opens java.base/java.lang.reflect=ALL-UNNAMED',
  '--add-opens java.base/java.nio=ALL-UNNAMED',
  '--add-opens java.base/java.nio.charset=ALL-UNNAMED',
  '--add-opens java.base/java.text=ALL-UNNAMED',
  '--add-opens java.base/java.time=ALL-UNNAMED',
  '--add-opens java.base/java.util=ALL-UNNAMED',
  '--add-opens java.desktop/java.awt.font=ALL-UNNAMED',
];

interface IPerforce {
  hostColonPort: string;
  user: string;
  workspace: string;
}

interface IChangelist {
  changelistNumber: string;
  changelistLabel: string;
}

interface ITeamcity {
  url: string;
  user: string;
}

const TEAMCITY_USER_SUFFIX = '.lab@otxlab.net';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  version = '1.0.0';

  tcc9xxJar: string;

  os: any;
  fs: any;
  path: any;
  childProcess: any;

  workspaceRoot: string;

  // Perforce
  perforce: IPerforce = {
    hostColonPort: '10.9.17.32:1667',
    user: '',
    workspace: '',
  };

  perforceLoggedIn = false;

  perforceChangelists: IChangelist[] = [];
  selectedPerforceChangelist: IChangelist;

  perforceChangelistFiles: string[] = [];

  loadingPerforceChangelistFiles = false;

  // Teamcity
  teamcity: ITeamcity = {
    url: 'http://iatc.otxlab.net:8111/',
    user: TEAMCITY_USER_SUFFIX,
  };

  promptForTeamcityPassword = false;
  teamcityPassword = '';

  teamcityLoggedIn = false;

  allConfigurationsForBranch = false;

  teamcityProjectId: any;

  teamcityConfigurations: string[] = [];
  selectedConfigurations: string[] = [];

  loadingTeamcityConfigurations =  true;

  constructor(
    private electronService: ElectronService,
    private translate: TranslateService,
    private ngzone: NgZone
  ) {
    this.os = os;
    this.path = path;
    this.fs = fs;
    this.childProcess = child_process;
    this.translate.setDefaultLang('en');

    this.tcc9xxJar = this.path.join(__dirname, 'assets', 'teamcity', 'tcc-9.x.x.jar');
  }

  ngOnInit(): void {
    const USERNAME = this.os.userInfo ().username;
    if (this.perforce.user === '') {
      this.perforce.user = USERNAME;
    }

    if (this.teamcity.user === TEAMCITY_USER_SUFFIX) {
      this.teamcity.user = USERNAME + TEAMCITY_USER_SUFFIX;
    }

    child_process.exec(`p4 info`, async (err, stdout, stderr) => {
      if (err) {
          return;
      }
      const infos = stdout.split(/\r?\n/);
      infos.forEach(info => {
        if (info.startsWith('Client name: ')) {
            this.perforce.workspace = info.substring(13);
        }
        if (info.startsWith('Client root: ')) {
            this.workspaceRoot = info.substring(13);
        }
      });
      this.ngzone.runOutsideAngular(async () => {
        this.childProcess.exec(`start /wait "Perforce Login Check" cmd /c p4 login -s`, async (err, stdout, stderr) => {
          this.ngzone.run(async () => {
            if (err) {
              this.perforceLoggedIn = false;
              return;
            }
            this.loggedIntoPerforce();
          });
        });
      });
    });
    this.ngzone.runOutsideAngular(async () => {
      this.childProcess.exec(`java ${ADD_OPENS.join(' ')} -jar ${this.tcc9xxJar} info --host ${this.teamcity.url}`, async (err, stdout, stderr) => {
        this.ngzone.run(async () => {
          if (err) {
            this.teamcityLoggedIn = false;
            return;
          }
          this.teamcityLoggedIn = true;
          this.loadTeamcityConfigurations();
        });
      });
    });
  }

  public loginIntoPerforce() {
    this.ngzone.runOutsideAngular(async () => {
      this.childProcess.exec(`start /wait "Perforce Login" cmd /c p4 login`, async (err, stdout, stderr) => {
        this.ngzone.run(async () => {
          if (err) {
            this.perforceLoggedIn = false;
            return;
          }
          this.loggedIntoPerforce();
        });
      });
    });
  }

  loggedIntoPerforce() {
    this.perforceLoggedIn = true;

    this.ngzone.runOutsideAngular(async () => {
      this.childProcess.exec(`p4 changes -l -c ${this.perforce.workspace} -s pending`, async (err: any, stdout: string, stderr: string) => {
        this.ngzone.run(async () => {
          if (err) {
            this.logoutOfPerforce();
            return;
          }

          // Changelist number and description
          const pendingChangelistsLines = [];
          const changelistsRaw = stdout.split(/\r?\n/).filter(line => line.trim().length > 0);

          let changeLine ;
          let descriptionLines = [];

          while (changelistsRaw.length > 0) {
            const line = (changelistsRaw.shift())?.trim();
            if (line) {
              if (line.startsWith('Change ')) {
                // Previously accumulated
                if (changeLine) {
                  const changelistLine = changeLine;
                  let description = '';
                  if (descriptionLines && descriptionLines.length > 0) {
                    description = descriptionLines.join(' ');
                  }
                  pendingChangelistsLines.push(`${changelistLine} ${description}`);
                  changeLine = line;
                  descriptionLines = [];
                } else {
                  changeLine = line;
                }
              } else {
                // Start new
                descriptionLines.push(line);
              }
            }
          }

          // Last accumulated
          if (changeLine) {
            const changelistLine = changeLine;
            let description = '';
            if (descriptionLines && descriptionLines.length > 0) {
              description = descriptionLines.join(' ');
            }
            pendingChangelistsLines.push(`${changelistLine} ${description}`);
          }

          this.perforceChangelists = pendingChangelistsLines.map((change) => {
            let changeParts = change.split(' ');
            const changelistNumber = changeParts[1];
            changeParts = change.split(' *pending* ');
            const changelistLabel = changeParts[1].replace(/'/g, '').trim();
            return {
              changelistNumber,
              changelistLabel: `${changelistNumber} - ${changelistLabel}`
            };
          });

          if (this.perforceChangelists.length === 0) {
            this.selectedPerforceChangelist = undefined;
          } else {
            this.selectedPerforceChangelist = this.perforceChangelists[0];
          }

          this.loadPerforceChangelistFiles();
        });
      });
    });
  }

  public logoutOfPerforce() {
    this.perforceLoggedIn = false;
    this.ngzone.runOutsideAngular(async () => {
      this.childProcess.exec(`start /wait "Perforce Login" cmd /c p4 logout`, async (err, stdout, stderr) => {
        this.ngzone.run(async () => {
          this.perforceLoggedIn = false;
          this.selectedPerforceChangelist = undefined;
          this.perforceChangelists = [];
          this.perforceChangelistFiles = [];
        });
      });
    });
  }

  public loginIntoTeamcity() {
    this.ngzone.runOutsideAngular(async () => {
      this.childProcess.exec(`start /wait "Teamcity Login" cmd /c java ${ADD_OPENS.join(' ')} -jar ${this.tcc9xxJar} login --host ${this.teamcity.url} --user ${this.teamcity.user}`, async (err, stdout, stderr) => {
        this.ngzone.run(async () => {
          if (err) {
            this.teamcityLoggedIn = false;
            return;
          }
          this.teamcityLoggedIn = true;
        });
      });
    });
  }

  public logoutOfTeamcity() {
    this.ngzone.runOutsideAngular(async () => {
      this.childProcess.exec(`java ${ADD_OPENS.join(' ')} -jar ${this.tcc9xxJar} logout --host ${this.teamcity.url}`, async (err, stdout, stderr) => {
        this.ngzone.run(async () => {
          this.teamcityLoggedIn = false;
          this.teamcityConfigurations = [];
          this.selectedConfigurations = [];
        });
      });
    });
  }

  public loadPerforceChangelistFiles() {
    this.loadingPerforceChangelistFiles = true;
    this.perforceChangelistFiles = [];
    this.teamcityConfigurations = [];
    this.selectedConfigurations = [];
    if (this.selectedPerforceChangelist) {
      this.ngzone.runOutsideAngular(async () => {
        this.childProcess.exec(`p4 -ztag opened -C ${this.perforce.workspace} -c ${this.selectedPerforceChangelist.changelistNumber}`, async (err, stdout, stderr) => {
          this.ngzone.run(async () => {
            this.loadingPerforceChangelistFiles = false;
            if (err) {
              return;
            }
            this.perforceChangelistFiles = stdout.split(/\r?\n/)
              .filter(change => change.startsWith('... clientFile '))
              .map((change) => change.split(' ')[2])
              .map(change => change.replace(`//${this.perforce.workspace}`, `${this.workspaceRoot}`))
              .map(change => change.replace(/\//g, this.path.sep).replace(/\\/g, this.path.sep));
            this.loadTeamcityConfigurations();
          });
        });
      });
    }
  }

  public loadTeamcityConfigurations() {
    this.loadingTeamcityConfigurations = true;
    this.teamcityConfigurations = [];
    this.selectedConfigurations = [];
    if (this.teamcityLoggedIn) {
      if (this.perforceChangelistFiles.length > 0) {
        this.teamcityProjectId = undefined;
        if (this.allConfigurationsForBranch) {
          Object.keys(PERFORCE_BRANCH_TO_TEAMCITY_PROJECT_ID_MAP).forEach( key => {
            const cannanicalKey = key.replace(/\//g, path.sep).replace(/\\/g, path.sep);
            if (this.perforceChangelistFiles[0].indexOf(cannanicalKey) !== -1) {
                this.teamcityProjectId = PERFORCE_BRANCH_TO_TEAMCITY_PROJECT_ID_MAP[key];
              }
          });
        } else {
          Object.keys(PERFORCE_PROJECT_TO_TEAMCITY_PROJECT_ID_MAP).forEach( key => {
            const cannanicalKey = key.replace(/\//g, path.sep).replace(/\\/g, path.sep);
            if (this.perforceChangelistFiles[0].indexOf(cannanicalKey) !== -1) {
                this.teamcityProjectId = PERFORCE_PROJECT_TO_TEAMCITY_PROJECT_ID_MAP[key];
              }
          });
        }
        if (this.teamcityProjectId) {
          this.ngzone.runOutsideAngular(async () => {
            this.childProcess.exec(`java ${ADD_OPENS.join(' ')} -jar ${this.tcc9xxJar} info -p ${this.teamcityProjectId}`, async (err, stdout, stderr) => {
              this.ngzone.run(async () => {
                this.loadingTeamcityConfigurations = false;
                if (err) {
                  return;
                }
                const configIds = stdout.split(/\r?\n/)
                  .filter(change => change.trim().length > 0)
                  .map((change) => change.split(' ')[0]);
                do {
                    configIds.shift();
                }  while (configIds.length > 0 && configIds[0] !== 'id');
                if (configIds.length > 0) {
                    configIds.shift();
                }
                if (configIds.length > 0) {
                  this.teamcityConfigurations = configIds;
                }
              });
            });
          });
        }
      }
    }
  }

  public runRemoteRun() {
    const tempFolderForWorkspace = this.fs.mkdtempSync(path.join(os.tmpdir(), `${this.perforce.workspace}-`));
    const pendingChangelistFilelistFile = path.join(tempFolderForWorkspace, `p4-changelist-${this.selectedPerforceChangelist.changelistNumber}.filelist`);
    this.fs.writeFileSync(pendingChangelistFilelistFile, this.perforceChangelistFiles.join('\n'));
    console.log(``);

    this.childProcess.exec(`cmd /K start echo Use the following command to run a remote run... ^^^& echo java ${ADD_OPENS.join(' ')} -jar ${this.tcc9xxJar} run -n --force-compatibility-check --force-compatibility-check -c ${this.selectedConfigurations} -m "${this.selectedPerforceChangelist.changelistLabel}" @${pendingChangelistFilelistFile}`, async (err, stdout, stderr) => {
      this.ngzone.run(async () => {
        if (err) {
          return;
        }
      });
    });

    // child_process.exec(`java -jar tcc-9.x.x.jar run -n --force-compatibility-check -c ${this.selectedConfigurations} -m """Remote run""" @${pendingChangelistFilelistFile}`, async (err, stdout, stderr) => {
    //     if (err) {
    //         return;
    //     }
    // });
  }

  public quit() {
    window.close();
  }

}
