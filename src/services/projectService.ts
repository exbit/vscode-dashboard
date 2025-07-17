"use strict";

import * as vscode from 'vscode';

import { Project, Group } from "../models";
import { ADD_NEW_PROJECT_TO_FRONT, PROJECTS_KEY, StorageOption } from "../constants";
import BaseService from './baseService';
import ColorService from './colorService';

export default class ProjectService extends BaseService {

    colorService: ColorService;

    constructor(context: vscode.ExtensionContext, colorService: ColorService) {
        super(context);
        this.colorService = colorService;
    }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~ GET ~~~~~~~~~~~~~~~~~~~~~~~~~
    getGroups(noSanitize = false): Group[] {
        var groups = this.getProjectsFromStorage();

        if (!noSanitize) {
            groups = this.sanitizeGroups(groups);
        }

        return groups;
    }

    getAllGroupsFlat(): Group[] {
        const groups = this.getGroups();
        const flatGroups: Group[] = [];

        const addGroupsRecursively = (groupList: Group[]) => {
            for (const group of groupList) {
                flatGroups.push(group);
                if (group.children && group.children.length > 0) {
                    addGroupsRecursively(group.children);
                }
            }
        };

        addGroupsRecursively(groups);
        return flatGroups;
    }

    getGroup(groupId: string): Group {
        const flatGroups = this.getAllGroupsFlat();
        return flatGroups.find(g => g.id === groupId) || null;
    }

    getProjectsFlat(): Project[] {
        const flatGroups = this.getAllGroupsFlat();
        var projects = [];
        for (let group of flatGroups) {
            projects.push.apply(projects, group.projects);
        }

        return projects;
    }

    getProject(projectId: string): Project {
        var [project] = this.getProjectAndGroup(projectId);
        return project;
    }

    getProjectAndGroup(projectId: string): [Project, Group] {
        if (projectId == null) {
            return null;
        }

        const flatGroups = this.getAllGroupsFlat();
        for (let group of flatGroups) {
            let project = group.projects.find(p => p.id === projectId);
            if (project != null) {
                return [project, group];
            }
        }
        return [null, null];
    }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~ ADD ~~~~~~~~~~~~~~~~~~~~~~~~~
    async addGroup(groupName: string, projects: Project[] = null, parentId?: string): Promise<Group> {
        var groups = this.getGroups();
        if (groups == null) {
            groups = [];
        }

        let newGroup = new Group(groupName, projects, parentId);

        if (parentId) {
            // Add to child group
            const parentGroup = this.findGroupInHierarchy(groups, parentId);
            if (parentGroup) {
                parentGroup.children.push(newGroup);
            } else {
                // If parent group not found, add to root
                groups.push(newGroup);
            }
        } else {
            // Add to root
            groups.push(newGroup);
        }

        await this.saveGroups(groups);
        return newGroup;
    }

    private findGroupInHierarchy(groups: Group[], groupId: string): Group | null {
        for (const group of groups) {
            if (group.id === groupId) {
                return group;
            }
            if (group.children && group.children.length > 0) {
                const found = this.findGroupInHierarchy(group.children, groupId);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    }

    async addProject(project: Project, groupId: string): Promise<Group[]> {
        // Get groups, default them to [] if there are no groups
        var groups = this.getGroups(true);
        if (groups == null) {
            groups = [];
        }

        // Get the group if there is any
        var group = this.findGroupInHierarchy(groups, groupId);

        if (group == null) {
            const flatGroups = this.getAllGroupsFlat();
            if (flatGroups.length) {
                // No group found, but there are groups? Default to first group
                group = flatGroups[0];
            } else {
                // No groups, create initial group
                group = new Group(null);
                groups.push(group);
            }
        }

        if (ADD_NEW_PROJECT_TO_FRONT) {
            group.projects.unshift(project);
        } else {
            group.projects.push(project);
        }

        // Add to recent colors
        try {
            await this.colorService.addRecentColor(project.color);
        } catch (e) {
            console.error(e);
        }

        await this.saveGroups(groups);
        return groups;
    }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~ UPDATE ~~~~~~~~~~~~~~~~~~~~~~~~~
    async updateProject(projectId: string, updatedProject: Project) {
        if (!projectId || updatedProject == null) {
            return;
        }

        var groups = this.getGroups();
        const flatGroups = this.getAllGroupsFlat();
        for (let group of flatGroups) {
            let project = group.projects.find(p => p.id === projectId);
            if (project != null) {
                Object.assign(project, updatedProject, { id: projectId });
                break;
            }
        }


        // Add to recent colors
        try {
            await this.colorService.addRecentColor(updatedProject.color);
        } catch (e) {
            console.error(e);
        }
        await this.saveGroups(groups);
    }

    async updateGroup(groupId: string, updatedGroup: Group) {
        if (!groupId || updatedGroup == null) {
            return;
        }

        var groups = this.getGroups();
        var group = this.findGroupInHierarchy(groups, groupId);
        if (group != null) {
            Object.assign(group, updatedGroup, { id: groupId });
        }

        await this.saveGroups(groups);
    }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~ REMOVE ~~~~~~~~~~~~~~~~~~~~~~~~~
    async removeProject(projectId: string): Promise<Group[]> {
        let groups = this.getGroups();
        for (let i = 0; i < groups.length; i++) {
            let group = groups[i];
            let index = group.projects.findIndex(p => p.id === projectId);

            if (index !== -1) {
                group.projects.splice(index, 1);
                break;
            }
        }
        await this.saveGroups(groups);
        return groups;
    }

    async removeGroup(groupId: string, testIfEmpty: boolean = false): Promise<Group[]> {
        let groups = this.getGroups();

        const removeFromHierarchy = (groupList: Group[]): Group[] => {
            return groupList.filter(g => {
                if (g.id === groupId && (!testIfEmpty || g.projects.length === 0)) {
                    return false;
                }
                if (g.children && g.children.length > 0) {
                    g.children = removeFromHierarchy(g.children);
                }
                return true;
            });
        };

        groups = removeFromHierarchy(groups);
        await this.saveGroups(groups);

        return groups;
    }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~ SAVE ~~~~~~~~~~~~~~~~~~~~~~~~~
    saveGroups(groups: Group[]): Thenable<void> {
        groups = this.sanitizeGroups(groups);

        return this.saveGroupsInStorage(groups);
    }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~ STORAGE ~~~~~~~~~~~~~~~~~~~~~~~~~
    private getCurrentStorageOption(): StorageOption {
        return this.useSettingsStorage() ? StorageOption.Settings : StorageOption.GlobalState;
    }

    private getProjectsFromStorage(storage: StorageOption = null, unsafe: boolean = false): Group[] {
        storage = storage || this.getCurrentStorageOption();

        switch (storage) {
            case StorageOption.Settings:
                return this.getProjectsFromSettings(unsafe);
            case StorageOption.GlobalState:
                return this.getProjectsFromGlobalState(unsafe);
            default:
                return [];
        }
    }

    private getProjectsFromGlobalState(unsafe: boolean = false): Group[] {
        var groups = this.context.globalState.get(PROJECTS_KEY) as Group[];

        if (groups == null && !unsafe) {
            groups = [];
        }

        return groups;
    }

    private getProjectsFromSettings(unsafe: boolean = false): Group[] {
        var groups = this.configurationSection.get('projectData') as Group[];

        if (groups == null && !unsafe) {
            groups = [];
        }

        return groups;
    }

    private saveGroupsInStorage(groups: Group[], storage: StorageOption = null): Thenable<void> {
        storage = storage || this.getCurrentStorageOption();

        switch (storage) {
            case StorageOption.Settings:
                return this.saveGroupsInSettings(groups);
            case StorageOption.GlobalState:
                return this.saveGroupsInGlobalState(groups);
            default:
                return Promise.resolve();
        }
    }

    private saveGroupsInGlobalState(groups: Group[]): Thenable<void> {
        return this.context.globalState.update(PROJECTS_KEY, groups);
    }

    private saveGroupsInSettings(groups: Group[]): Thenable<void> {
        return this.configurationSection.update("projectData", groups, vscode.ConfigurationTarget.Global);
    }

    private getStorageOptionsWithData(): StorageOption[] {
        var storageOptions: StorageOption[] = [];

        if (this.getProjectsFromSettings()?.length) {
            storageOptions.push(StorageOption.Settings);
        }

        if (this.getProjectsFromGlobalState()?.length) {
            storageOptions.push(StorageOption.GlobalState);
        }

        return storageOptions;
    }

    otherStorageHasData(currentStorage: StorageOption = null): boolean {
        currentStorage = currentStorage || this.getCurrentStorageOption();
        return this.getStorageOptionsWithData().some(s => s !== currentStorage);
    }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~ MODEL MIGRATION ~~~~~~~~~~~~~~~~~~~~~~~~~
    async copyProjectsFromFilledStorageOptionToEmptyStorageOption(): Promise<void> {
        if (this.getProjectsFromStorage().length) {
            return;
        }

        var storageOptionToCopyFrom = this.getStorageOptionsWithData().find(s => s !== this.getCurrentStorageOption());

        var projects = this.getProjectsFromStorage(storageOptionToCopyFrom, true);
        await this.saveGroupsInStorage(projects);
    }

    async migrateDataIfNeeded() {
        var toMigrate = false;
        var projectsInSettings = this.getProjectsFromSettings(true);
        var projectsInGlobalState = this.getProjectsFromGlobalState(true);

        if (this.useSettingsStorage()) {
            // Migrate from Global State to Settings
            toMigrate = projectsInSettings == null && projectsInGlobalState != null;

            if (toMigrate) {
                await this.saveGroupsInSettings(projectsInGlobalState);
            }

            //await this.saveGroupsInGlobalState(null);
        } else {
            // Migrate from Settings To Global State
            toMigrate = projectsInGlobalState == null && projectsInSettings != null;

            if (toMigrate) {
                await this.saveGroupsInGlobalState(projectsInSettings);
            }

            //await this.saveGroupsInSettings(null);
        }


        return toMigrate;
    }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~ HELPERS ~~~~~~~~~~~~~~~~~~~~~~~~~

    private sanitizeGroups(groups: Group[]): Group[] {
        groups = Array.isArray(groups) ? groups.filter(g => !!g) : [];

        const sanitizeRecursively = (groupList: Group[]) => {
            for (let g of groupList) {
                // Fill id, should only happen if user removes id manually. But better be safe than sorry.
                if (!g.id) {
                    g.id = Group.getRandomId();
                }

                // Ensure projects array exists
                if (!g.projects) {
                    g.projects = [];
                }

                // Ensure children array exists
                if (!g.children) {
                    g.children = [];
                }

                // Recursively sanitize children
                if (g.children.length > 0) {
                    g.children = this.sanitizeGroups(g.children);
                }
            }
        };

        sanitizeRecursively(groups);
        return groups;
    }
}