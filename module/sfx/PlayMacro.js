import { DiceSFX } from '../DiceSFX.js';

/**
 * Options needed: macro ID
 */
export class PlayMacro extends DiceSFX {
    static id = "PlayMacro";
    static specialEffectName = "DICESONICE.PlayMacro";
    static PLAY_ONLY_ONCE_PER_MESH = true;

    /**@override play */
    async play(options){
        let macro = game.macros.get(options.macroId);
        if(macro)
            macro.execute();
    }

    static getDialogContent(sfxLine,id){
        let dialogContent = super.getDialogContent(sfxLine,id);

        dialogContent.content = dialogContent.content.concat(`<div class="form-group">
                                        <label>{{localize "DICESONICE.sfxOptionsMacro"}}</label>
                                        <div class="form-fields">
                                            <select name="sfxLine[{{id}}][options][macroId]">
                                                {{selectOptions macroList valueAttr="id" labelAttr="name" selected=macroId}}
                                            </select>
                                        </div>
                                    </div>`);
        
        dialogContent.data.macroList = game.macros.filter(macro => macro.canExecute).map(macro => {return {id:macro.id,name:macro.name}});
        
        dialogContent.data.macroList.sort((a, b) => a.name > b.name && 1 || -1);
        dialogContent.data.macroId = sfxLine.options?sfxLine.options.macroId:null;
        return dialogContent;
    }
}