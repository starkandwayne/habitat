// Copyright (c) 2016-2017 Chef Software Inc. and/or applicable contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {Component, OnInit, OnDestroy} from "@angular/core";
import {RouterLink, ActivatedRoute} from "@angular/router";
import {AppStore} from "../AppStore";
import {fetchOrigin, fetchOriginInvitations, fetchOriginMembers,
        fetchOriginPublicKeys, inviteUserToOrigin, setCurrentOriginAddingPublicKey,
        setCurrentOriginAddingPrivateKey, uploadOriginPrivateKey,
        uploadOriginPublicKey, filterPackagesBy, fetchMyOrigins,
        setProjectHint, requestRoute, setCurrentProject, getUniquePackages} from "../actions/index";
import config from "../config";
import {Origin} from "../records/Origin";
import {requireSignIn, packageString} from "../util";
import {Subscription} from "rxjs/Subscription";
import {FeatureFlags} from "../Privilege";
import {List} from "immutable";

export enum ProjectStatus {
    Connect,
    Settings,
    Lacking
}

export enum KeyType {
    Public,
    Private
}

@Component({
    template: `
    <div class="hab-origin">
        <div class="page-title">
            <a class="button hab-origin--pkgs-link"
                [routerLink]="['/pkgs', origin.name]">
                View <em>{{origin.name}}</em> packages
            </a>
            <h2>{{origin.name}}</h2>
            <h4>Origin</h4>
        </div>
        <div *ngIf="!ui.exists && !ui.loading" class="page-body">
            <p>
                Failed to load origin.
                <span *ngIf="ui.errorMessage">
                    Error: {{ui.errorMessage}}
                </span>
            </p>
        </div>
        <hab-tabs *ngIf="ui.exists && !ui.loading">
            <hab-tab tabTitle="Packages" [onSelect]="loadPackages">
              <div class="page-body has-sidebar">
                <div class="hab-origin--left hab-origin--pkg-list">
                  <div *ngIf="noPackages">
                      <p>
                          No packages found.
                          <span *ngIf="packagesUi.errorMessage">
                              Error: {{packagesUi.errorMessage}}
                          </span>
                      </p>
                  </div>

                  <div *ngIf="!noPackages">
                    <div class="pkg-container">
                        <div class="pkg-col-1">Package Name</div>
                        <div class="pkg-col-2">&nbsp;</div>
                        <div class="pkg-col-3">Versions</div>
                    </div>

                    <div *ngFor="let pkg of packages" class="pkg-container">
                      <div class="pkg-col-1">
                        <h3>{{pkg.name}}</h3>
                      </div>
                      <div class="pkg-col-2">
                        &nbsp;
                      </div>
                      <div class="pkg-col-3">
                        <a [routerLink]="['/pkgs', pkg.origin, pkg.name]">
                          <img src="../assets/images/icon-layers.svg" alt="Versions" title="Versions">
                        </a>
                      </div>
                    </div>

                    <div *ngIf="packages.size < totalCount">
                        Showing {{packages.size}} of {{totalCount}} packages.
                        <a href="#" (click)="fetchMorePackages()">
                            Load
                            {{(totalCount - packages.size) > perPage ? perPage : totalCount - packages.size }}
                            more</a>.
                    </div>

                  </div>
                </div>
                <div class="hab-origin--right hab-origin--pkg-list">
                  <p>An <b>origin</b> defines packages that are conceptually related to each other.</p>
                  <p>Automated package builds are enabled once your package has been connected to a GitHub repo that contains a Habitat plan file.</p>
                  <p>You can either <a href="#">upload your packages to the depot</a> and connect them afterwards or connect a repo now and upload your packages later.</p>
                  <p>Read the docs for more information on <a href="#">origins</a>, <a href="#">packages</a>, and the <a href="#">build service</a>.</p>
                </div>
              </div>
            </hab-tab>
            <hab-tab tabTitle="Keys">
                <div class="page-body">
                    <div class="hab-origin--left">
                        <div class="hab-origin--key-list">
                            <h3>Public Origin Keys</h3>
                            <p><button
                                *ngIf="iAmPartOfThisOrigin"
                                (click)="setOriginAddingPublicKey(true)"
                                [disabled]="addingPublicKey">
                                Upload public origin key
                            </button></p>
                            <hab-key-add-form
                                *ngIf="iAmPartOfThisOrigin && addingPublicKey"
                                [docsUrl]="docsUrl"
                                [errorMessage]="ui.publicKeyErrorMessage"
                                keyFileHeaderPrefix="SIG-PUB-1"
                                [onCloseClick]="onPublicKeyCloseClick"
                                [originName]="origin.name"
                                [uploadKey]="uploadPublicKey">
                            </hab-key-add-form>
                            <p *ngIf="ui.publicKeyListErrorMessage">
                                Failed to load public keys:
                                {{ui.publicKeyListErrorMessage}}.
                            </p>
                            <hab-key-list
                                *ngIf="!ui.publicKeyListErrorMessage"
                                [keys]="publicKeys"
                                type="public origin"
                                [keyType]="keyType.Public">
                            </hab-key-list>
                        </div>
                        <hr>
                        <div class="hab-origin--key-list" *ngIf="iAmPartOfThisOrigin">
                            <h3>Private Origin Keys</h3>
                            <p><button
                                (click)="setOriginAddingPrivateKey(true)"
                                [disabled]="addingPrivateKey">
                                Upload private origin key
                            </button></p>
                            <hab-key-add-form
                                *ngIf="addingPrivateKey"
                                [errorMessage]="ui.privateKeyErrorMessage"
                                keyFileHeaderPrefix="SIG-SEC-1"
                                [onCloseClick]="onPrivateKeyCloseClick"
                                [originName]="origin.name"
                                [uploadKey]="uploadPrivateKey">
                            </hab-key-add-form>
                            <hab-key-list
                                *ngIf="privateKeyNames.size > 0"
                                [keys]="privateKeyNames"
                                type="private origin"
                                [keyType]="keyType.Private">
                            </hab-key-list>
                            <ul class="bullet">
                                <li>For security purposes, private keys can not be viewed or downloaded.</li>
                                <li>Only one private key exists for an origin at a
                                given time.</li>
                                <li><em>Uploading a new private key will overwrite the
                                existing private key.</em></li>
                            </ul>
                        </div>
                    </div>
                    <div class="hab-origin--right">
                        <p>
                            <em>Origin keys</em> ensure only authorized users (or
                            organizations) are able to push updates to packages
                            in this origin.
                        </p>
                        <p>
                            Read the docs for more information on
                            <a href="{{docsUrl}}/share-packages-overview/">
                                managing and using keys</a>.
                        </p>
                    </div>
                </div>
            </hab-tab>
            <hab-origin-members-tab
                [docsUrl]="docsUrl"
                [errorMessage]="ui.userInviteErrorMessage"
                [invitations]="invitations"
                [members]="members"
                [onSubmit]="onUserInvitationSubmit"
                *ngIf="iAmPartOfThisOrigin">
            </hab-origin-members-tab>
        </hab-tabs>
    </div>`,
})

export class OriginPageComponent implements OnInit, OnDestroy {
    keyType = KeyType;
    loadPackages: Function;
    onPrivateKeyCloseClick: Function;
    onPublicKeyCloseClick: Function;
    onUserInvitationSubmit: Function;
    uploadPrivateKey: Function;
    uploadPublicKey: Function;
    perPage: number = 50;
    projectStatus = ProjectStatus;

    private originParam: string;
    private sub: Subscription;

    constructor(private route: ActivatedRoute, private store: AppStore) {
        this.onPrivateKeyCloseClick = () =>
            this.setOriginAddingPrivateKey(false);
        this.onPublicKeyCloseClick = () =>
            this.setOriginAddingPublicKey(false);
        this.uploadPrivateKey = key =>
            this.store.dispatch(uploadOriginPrivateKey(key,
                this.gitHubAuthToken));
        this.uploadPublicKey = key =>
            this.store.dispatch(uploadOriginPublicKey(key,
                this.gitHubAuthToken));
        this.onUserInvitationSubmit = username =>
            this.store.dispatch(inviteUserToOrigin(
                username,
                this.origin.name,
                this.gitHubAuthToken
            ));

        this.sub = route.params.subscribe(params => {
            this.originParam = params["origin"];
        });
    }

    ngOnDestroy() {
        this.sub.unsubscribe();
    }

    get features() {
        return this.store.getState().users.current.flags;
    }

    get addingPrivateKey() {
        return this.ui.addingPrivateKey;
    }

    get addingPublicKey() {
        return this.ui.addingPublicKey;
    }

    get docsUrl() {
        return config["docs_url"];
    }

    get gitHubAuthToken() {
        return this.store.getState().gitHub.authToken;
    }

    get invitations() {
        return this.store.getState().origins.currentPendingInvitations;
    }

    get members() {
        return this.store.getState().origins.currentMembers;
    }

    get publicKeys() {
        return this.store.getState().origins.currentPublicKeys;
    }

    get privateKeyNames() {
        if (this.origin.private_key_name) {
            return List([this.origin.private_key_name]);
        } else {
            return List([]);
        }
    }

    // Initially set up the origin to be whatever comes from the params,
    // so we can query for it. In `ngOnInit`, we'll
    // populate more data by dispatching `fetchOrigin`.
    get origin() {
        const currentOriginFromState = this.store.getState().origins.current;

        // Use the current origin from the state if it's the same origin we want
        // here.
        if (currentOriginFromState.name === this.originParam) {
            return currentOriginFromState;
        } else {
            return Origin({ name: this.originParam });
        }
    }

    get ui() {
        return this.store.getState().origins.ui.current;
    }

    get packagesUi() {
        return this.store.getState().packages.ui.visible;
    }

    get packages() {
        return this.store.getState().packages.visible;
    }

    get totalCount() {
        return this.store.getState().packages.totalCount;
    }

    get noPackages() {
        return (!this.packagesUi.exists || this.packages.size === 0) && !this.packagesUi.loading;
    }

    get myOrigins() {
        return this.store.getState().origins.mine;
    }

    get iAmPartOfThisOrigin() {
        return !!this.myOrigins.find(org => {
            return org["name"] === this.origin.name;
        });
    }

    linkToRepo(p): boolean {
        this.store.dispatch(setProjectHint({
            originName: p.origin,
            packageName: p.name
        }));
        this.store.dispatch(requestRoute(["/projects", "create"]));
        return false;
    }

    projectSettings(p): boolean {
        this.store.dispatch(setProjectHint({
            originName: p.origin,
            packageName: p.name
        }));
        this.store.dispatch(setCurrentProject(this.projectForPackage(p)));
        this.store.dispatch(requestRoute(["/projects", p.origin, p.name, "settings"]));
        return false;
    }

    setOriginAddingPrivateKey(state: boolean) {
        this.store.dispatch(setCurrentOriginAddingPrivateKey(state));
        return false;
    }

    setOriginAddingPublicKey(state: boolean) {
        this.store.dispatch(setCurrentOriginAddingPublicKey(state));
        return false;
    }

    projectForPackage(p) {
        let proj = this.store.getState().projects.added.find(proj => {
            return proj["id"] === this.projectId(p);
        });

        if (proj) {
            if (proj["vcs"] && proj["vcs"]["url"]) {
                return ProjectStatus.Settings;
            } else {
                return ProjectStatus.Lacking;
            }
        } else {
            return ProjectStatus.Connect;
        }
    }

    getPackages() {
        this.store.dispatch(getUniquePackages(this.origin.name, 0, this.gitHubAuthToken));
    }

    fetchMorePackages() {
        this.store.dispatch(getUniquePackages(
            this.origin.name,
            this.store.getState().packages.nextRange,
            this.gitHubAuthToken
        ));
        return false;
    }

    ngOnInit() {
        requireSignIn(this);
        this.store.dispatch(fetchOrigin(this.origin.name));
        this.store.dispatch(fetchMyOrigins(this.gitHubAuthToken));
        this.store.dispatch(fetchOriginPublicKeys(
            this.origin.name, this.gitHubAuthToken
        ));
        this.store.dispatch(fetchOriginMembers(
            this.origin.name, this.gitHubAuthToken
        ));
        this.store.dispatch(fetchOriginInvitations(
            this.origin.name, this.gitHubAuthToken
        ));
        this.getPackages();
        this.loadPackages = this.getPackages.bind(this);
    }

    private projectId(p) {
        return `${p["origin"]}/${p["name"]}`;
    }
}
