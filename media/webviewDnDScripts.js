function initDnD() {
    const projectsContainerSelector = ".group-list";
    const groupsContainerSelector = ".groups-wrapper";

    document.body.classList.remove("preload");

    var projectsContainers = document.querySelectorAll(projectsContainerSelector);
    var projectDrake = dragula([].slice.call(projectsContainers), {
        moves: function (el, source, handle, sibling) {
            return !el.hasAttribute("data-nodrag");
        },
    });
    projectDrake.on('drop', onReordered);
    projectDrake.on('drag', () => document.body.classList.add('project-dragging'));
    projectDrake.on('dragend', () => document.body.classList.remove('project-dragging'));

    var groupsContainers = document.querySelectorAll(groupsContainerSelector);
    var groupsDrake = dragula([].slice.call(groupsContainers), {
        moves: function (el, source, handle, sibling) {
            return handle.hasAttribute("data-drag-group");
        },
    });
    groupsDrake.on('drop', onReordered);

    const scroll = autoScroll(window, {
        margin: 20,
        autoScroll: function () {
            return this.down && (projectDrake.dragging || groupsDrake.dragging);
        }
    });

    // Function to update dragula containers when new groups are added
    function updateDragulaContainers() {
        // Update project containers
        var newProjectsContainers = document.querySelectorAll(projectsContainerSelector);
        var currentProjectsContainers = projectDrake.containers;

        // Add new containers
        newProjectsContainers.forEach(container => {
            if (!currentProjectsContainers.includes(container)) {
                projectDrake.containers.push(container);
            }
        });

        // Remove non-existent containers
        projectDrake.containers = projectDrake.containers.filter(container =>
            document.contains(container)
        );
    }

    // Listen for DOM changes to update containers
    const observer = new MutationObserver(function(mutations) {
        let shouldUpdate = false;
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1 && // Element node
                        (node.classList.contains('group') || node.querySelector('.group'))) {
                        shouldUpdate = true;
                    }
                });
            }
        });

        if (shouldUpdate) {
            updateDragulaContainers();
        }
    });

    // Start observing changes
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    window.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            projectDrake.cancel(true);
            groupsDrake.cancel(true);
        }
    });

    function buildGroupHierarchy(element, level = 0) {
        const groupId = element.getAttribute("data-group-id") || "";

        // More reliable selector for projects
        const projectElements = element.querySelectorAll(":scope > .group-list > .project-container > .project[data-id], :scope > .group-list > .project[data-id]");
        const projectIds = [].slice.call(projectElements).map(p => p.getAttribute("data-id")).filter(id => id);

        // Find subgroups in current group
        const subgroupsContainer = element.querySelector(":scope > .subgroups");
        const children = [];

        if (subgroupsContainer) {
            const subgroupElements = subgroupsContainer.querySelectorAll(":scope > .group[data-group-id]");
            for (let subgroupElement of subgroupElements) {
                children.push(buildGroupHierarchy(subgroupElement, level + 1));
            }
        }

        return {
            groupId,
            projectIds,
            children,
            level
        };
    }

    function onReordered() {
        // Find all top level groups
        let topLevelGroupElements = [...document.querySelectorAll(`${groupsContainerSelector} > .group[data-group-id]`)];

        // Handle temporary "Create New Group" only if it has projects
        let tempGroupElement = document.querySelector('#tempGroup');
        if (tempGroupElement) {
            const projectsInTemp = tempGroupElement.querySelectorAll("[data-id]");

            if (projectsInTemp.length > 0) {
                // Assign temporary ID for temporary group
                if (!tempGroupElement.getAttribute("data-group-id")) {
                    const tempId = "temp-" + Date.now();
                    tempGroupElement.setAttribute("data-group-id", tempId);
                }
                topLevelGroupElements.push(tempGroupElement);
            }
        }

        // Build group hierarchy
        let groupHierarchy = [];
        for (let groupElement of topLevelGroupElements) {
            const hierarchy = buildGroupHierarchy(groupElement);

            // Add all groups - even empty ones to preserve structure
            groupHierarchy.push(hierarchy);
        }

        window.vscode.postMessage({
            type: 'reordered-projects',
            groupHierarchy,
        });
    }

    // Export function for external use
    window.updateDragulaDnD = updateDragulaContainers;

    // Force update containers after initialization
    // to ensure temporary group is included
    setTimeout(() => {
        updateDragulaContainers();
    }, 100);
};