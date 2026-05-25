import {Dice3D} from "../Dice3D.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class RollableAreaConfig extends HandlebarsApplicationMixin(ApplicationV2) {
    
    static DEFAULT_OPTIONS = {
        tag: "form",
        form: {
            handler: RollableAreaConfig._onSubmit,
        },
        window: {
            title: "DICESONICE.RollableAreaConfigTitle",
            contentClasses: ["standard-form"]
        },
        classes: ["rollable-area-config"],
        position: {
            width: 280,
            top: 70,
            left: window.innerWidth - 290
        },
        actions: {
            restore: RollableAreaConfig._onRestore
        }
    };

    static PARTS = {
        form: {
            template: "modules/dice-so-nice/templates/rollable-area-config.hbs"
        },
        footer: {
            template: "templates/generic/form-footer.hbs"
        }        
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.buttons = [
            { type: "submit", name: "apply", icon: "fa-solid fa-save", label: "DICESONICE.Apply" },
            { type: "button", name: "restore", action: "restore", icon: "fa-solid fa-undo", label: "DICESONICE.Restore" }
        ];
        return context;
    }

    render(options) {
        this.area = document.createElement("div");
        this.area.className = "dice-so-nice rollable-area";
        this.area.innerHTML = `<div class='resizers'>
            <div class='resizer nw'></div>
            <div class='resizer ne'></div>
            <div class='resizer sw'></div>
            <div class='resizer se'></div>
            <div class="info">${game.i18n.localize("DICESONICE.RollableAreaText")}</div>
        </div>`;

        let rollingArea = Dice3D.CONFIG().rollingArea;
        if(!rollingArea) {
            const diceBox = document.getElementById("dice-box-canvas");
            const diceBoxRect = diceBox.getBoundingClientRect();
            rollingArea = {
                top: diceBoxRect.top,
                left: diceBoxRect.left,
                width: diceBox.offsetWidth,
                height: diceBox.offsetHeight
            }
        }
        document.body.append(this.area);
        Object.assign(this.area.style, {
            top: rollingArea.top + "px",
            left: rollingArea.left + "px",
            width: rollingArea.width + "px",
            height: rollingArea.height + "px"
        });
        
        this.activateListeners();

        return super.render(options);
    }

    activateListeners() {
        // Get the body element's top style because of the "Window Controls" plugin that adds a "top" to the body element
        const bodyTop = parseInt(window.getComputedStyle(document.body).top, 10) || 0;

        let el = this.area;
        let resizing = false;
        this.area.addEventListener("mousedown", (e) => {
            let prevX = e.clientX;
            let prevY = e.clientY;

            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", onMouseUp);

            function onMouseMove(e) {
                if (!resizing) {
                    let newX = prevX - e.clientX;
                    let newY = prevY - e.clientY;

                    const rect = el.getBoundingClientRect();

                    let newLeft = rect.left - newX;
                    let newTop = rect.top - newY;
                    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - rect.width));
                    newTop = Math.max(0, Math.min(newTop, window.innerHeight - rect.height));

                    el.style.left = newLeft + 'px';
                    el.style.top = newTop - bodyTop + 'px';

                    prevX = e.clientX;
                    prevY = e.clientY;
                }
            }

            function onMouseUp() {
                window.removeEventListener("mousemove", onMouseMove);
                window.removeEventListener("mouseup", onMouseUp);
            }
        });

        const resizers = this.area.querySelectorAll(".resizers > .resizer");
        for(let resizer of resizers) {
            resizer.addEventListener("mousedown", (e) => {
                resizing = true;
                let prevX = e.clientX;
                let prevY = e.clientY;

                window.addEventListener("mousemove", onMouseMove);
                window.addEventListener("mouseup", onMouseUp);

                function onMouseMove(e) {
                    const rect = el.getBoundingClientRect();
                    const MIN_SIZE = 200;

                    if(resizer.classList.contains("se")) {
                        el.style.width = Math.max(MIN_SIZE, rect.width - (prevX - e.clientX)) + "px";
                        el.style.height = Math.max(MIN_SIZE, rect.height - (prevY - e.clientY)) + "px";
                    }
                    else if(resizer.classList.contains("sw")) {
                        const newWidth = Math.max(MIN_SIZE, rect.width + (prevX - e.clientX));
                        const newHeight = Math.max(MIN_SIZE, rect.height - (prevY - e.clientY));
                        if(newWidth > MIN_SIZE) el.style.left = rect.left - (prevX - e.clientX) + "px";
                        el.style.width = newWidth + "px";
                        el.style.height = newHeight + "px";
                    }
                    else if(resizer.classList.contains("ne")) {
                        const newWidth = Math.max(MIN_SIZE, rect.width - (prevX - e.clientX));
                        const newHeight = Math.max(MIN_SIZE, rect.height + (prevY - e.clientY));
                        if(newHeight > MIN_SIZE) el.style.top = rect.top - (prevY - e.clientY) - bodyTop + "px";
                        el.style.width = newWidth + "px";
                        el.style.height = newHeight + "px";
                    }
                    else {
                        const newWidth = Math.max(MIN_SIZE, rect.width + (prevX - e.clientX));
                        const newHeight = Math.max(MIN_SIZE, rect.height + (prevY - e.clientY));
                        if(newWidth > MIN_SIZE) el.style.left = rect.left - (prevX - e.clientX) + "px";
                        if(newHeight > MIN_SIZE) el.style.top = rect.top - (prevY - e.clientY) - bodyTop + "px";
                        el.style.width = newWidth + "px";
                        el.style.height = newHeight + "px";
                    }

                    prevX = e.clientX;
                    prevY = e.clientY;
                }

                function onMouseUp() {
                    window.removeEventListener("mousemove", onMouseMove);
                    window.removeEventListener("mouseup", onMouseUp);
                    resizing = false;
                }
            });
        }
    }

    static async _onRestore() {
        await this.saveSettingsAndReload(false);
        await this.close();
    }

    async _updateObject() {
        const rect = this.area.getBoundingClientRect();
        await this.saveSettingsAndReload({
            top: rect.top,
            left: rect.left,
            width: this.area.offsetWidth,
            height: this.area.offsetHeight
        });
    }

    async saveSettingsAndReload(rollingArea) {
        let settings = foundry.utils.mergeObject(Dice3D.CONFIG(), {
            rollingArea: rollingArea
        },{applyOperators:true});
        await game.user.setFlag('dice-so-nice', 'settings', settings);
        foundry.applications.settings.SettingsConfig.reloadConfirm();
    }

    async close(options={}) {
        this.area.remove();
        return super.close(options);
    }

    static async _onSubmit(event, form, formData) {
        this._updateObject(event, formData);
    }
}
