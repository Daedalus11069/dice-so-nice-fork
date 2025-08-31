import {Dice3D} from "./Dice3D.js";

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
            template: "modules/dice-so-nice/templates/rollable-area-config.html"
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
        this.area = $(`
            <div class='dice-so-nice rollable-area'>
                <div class='resizers'>
                    <div class='resizer nw'></div>
                    <div class='resizer ne'></div>
                    <div class='resizer sw'></div>
                    <div class='resizer se'></div>
                    <div class="info">${game.i18n.localize("DICESONICE.RollableAreaText")}</div> 
                </div>
            </div>
        `);

        let rollingArea = Dice3D.CONFIG().rollingArea;
        if(!rollingArea) {
            const $diceBox = $("#dice-box-canvas");
            rollingArea = {
                top: $diceBox.position().top,
                left: $diceBox.position().left,
                width: $diceBox.width(),
                height: $diceBox.height()
            }
        }
        this.area.appendTo($('body'));
        this.area.css(rollingArea);
        
        this.activateListeners();

        return super.render(options);
    }

    activateListeners() {
        // Get the body element's top style because of the "Window Controls" plugin that adds a "top" to the body element
        const bodyTop = parseInt(window.getComputedStyle(document.body).top, 10) || 0;

        let el = $(this.area).get(0);
        let resizing = false;
        this.area.mousedown(function(e) {
            let prevX = e.clientX;
            let prevY = e.clientY;

            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", onMouseUp);

            function onMouseMove(e) {
                if (!resizing) {
                    let newX = prevX - e.clientX;
                    let newY = prevY - e.clientY;

                    const rect = el.getBoundingClientRect();

                    el.style.left = rect.left - newX + 'px';
                    el.style.top = rect.top - newY - bodyTop + 'px';

                    prevX = e.clientX;
                    prevY = e.clientY;
                }
            }

            function onMouseUp() {
                window.removeEventListener("mousemove", onMouseMove);
                window.removeEventListener("mouseup", onMouseUp);
            }
        });

        const resizers = $(".rollable-area > .resizers > .resizer");
        for(let resizer of resizers) {
            $(resizer).mousedown(function (e) {
                resizing = true;
                let prevX = e.clientX;
                let prevY = e.clientY;

                window.addEventListener("mousemove", onMouseMove);
                window.addEventListener("mouseup", onMouseUp);

                function onMouseMove(e) {
                    const rect = el.getBoundingClientRect();

                    if(resizer.classList.contains("se")) {
                        el.style.width = rect.width - (prevX - e.clientX) + "px";
                        el.style.height = rect.height - (prevY - e.clientY) + "px";
                    }
                    else if(resizer.classList.contains("sw")) {
                        el.style.width = rect.width + (prevX - e.clientX) + "px";
                        el.style.height = rect.height - (prevY - e.clientY) + "px";
                        el.style.left = rect.left - (prevX - e.clientX) + "px";
                    }
                    else if(resizer.classList.contains("ne")) {
                        el.style.width = rect.width - (prevX - e.clientX) + "px";
                        el.style.height = rect.height + (prevY - e.clientY) + "px";
                        el.style.top = rect.top - (prevY - e.clientY) - bodyTop + "px";
                    }
                    else {
                        el.style.width = rect.width + (prevX - e.clientX) + "px";
                        el.style.height = rect.height + (prevY - e.clientY) + "px";
                        el.style.left = rect.left - (prevX - e.clientX) + "px";
                        el.style.top = rect.top - (prevY - e.clientY) - bodyTop + "px";
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
        await this.saveSettingsAndReload({
            top: this.area.position().top,
            left: this.area.position().left,
            width: this.area.width(),
            height: this.area.height()
        });
    }

    async saveSettingsAndReload(rollingArea) {
        let settings = foundry.utils.mergeObject(Dice3D.CONFIG(), {
            rollingArea: rollingArea
        },{performDeletions:true});
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
