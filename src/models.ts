'use strict';

import * as vscode from 'vscode';
import { SSH_REMOTE_PREFIX, StorageOption, WSL_DEFAULT_REGEX } from "./constants";

export class Group {
    id: string;
    groupName: string;
    collapsed: boolean;
    projects: Project[];
    children: Group[];
    parentId?: string;

    constructor(groupName: string, projects: Project[] = null, parentId?: string) {
        this.id = generateRandomId(groupName);
        this.groupName = groupName;
        this.projects = projects || [];
        this.children = [];
        this.parentId = parentId;
    }

    static getRandomId(prepend: string = null) {
        return generateRandomId(prepend);
    }
}

export class Project {
    id: string;
    name: string;
    path: string;
    color: string;
    isGitRepo = false;

    constructor(name: string, path: string) {
        this.id = generateRandomId(name);
        this.name = name;
        this.path = path;
    }

    getRemoteType(): ProjectRemoteType {
        if (this.path && this.path.startsWith(SSH_REMOTE_PREFIX)) {
            return ProjectRemoteType.SSH;
        } else if (this.path && (this.path.match(WSL_DEFAULT_REGEX) || this.path.startsWith("vscode-remote://wsl+"))) {
            return ProjectRemoteType.WSL;
        }

        return ProjectRemoteType.None;
    }

    static getRandomId(prepend: string = null) {
        return generateRandomId(prepend);
    }
}

export function sanitizeProjectName(name: string) {
    if (!name) {
        return "";
    }

    return name.replace(/<[^>]+>/g, '').trim();
}

export function getRemoteType(project: Project): ProjectRemoteType {
    return Project.prototype.getRemoteType.call(project);
}

function generateRandomId(prepend: string = null) {
    if (prepend) {
        prepend = prepend.replace(/\W/ig, "").toLowerCase().substring(0, 24);
    } else {
        prepend = '';
    }

    return prepend + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

export interface GroupOrder {
    groupId: string;
    projectIds: string[];
}

export interface GroupHierarchy {
    groupId: string;
    projectIds: string[];
    children: GroupHierarchy[];
    level: number;
}

export interface DashboardInfos {
    relevantExtensionsInstalls: { remoteSSH },
    config: vscode.WorkspaceConfiguration,
    otherStorageHasData: boolean,
}

export enum ProjectPathType {
    Folder,
    WorkspaceFile,
    File,
}

export enum ProjectOpenType {
    Default = 0,
    NewWindow = 1,
    AddToWorkspace = 2,
}

export enum ProjectRemoteType {
    None,
    SSH,
    WSL,
}

export enum ReopenDashboardReason {
    None = 0,
    EditorReopenedAsWorkspace,
}