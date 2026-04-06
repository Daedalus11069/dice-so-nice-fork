import { Clock, Color } from 'three';
import { DiceSFX } from '../DiceSFX.js';
import { ShaderUtils } from './../ShaderUtils';

export class PlayAnimationBright extends DiceSFX {
    static id = "PlayAnimationBright";
    static specialEffectName = "DICESONICE.PlayAnimationBright";
    static brightColor = null;
    static duration = 0.6;
    static sound = "modules/dice-so-nice/sfx/sounds/bright.mp3";
    /**@override init */
    static async init() {
        PlayAnimationBright.brightColor = new Color(0.5,0.5,0.5);
        this.glowingMesh=null;
        game.audio.pending.push(function(){
            foundry.audio.AudioHelper.preloadSound(PlayAnimationBright.sound);
        }.bind(this));
    }

    /**@override play */
    async play() {
        if(!this.dicemesh.material && this.dicemesh.userData.glow){
            //We check if there's a glow target specified
            this.dicemesh.traverse(object => {
                if (object.userData && object.userData.name && object.userData.name === this.dicemesh.userData.glow) this.glowingMesh=object;
            });
        } else if(this.dicemesh.material){
            this.glowingMesh=this.dicemesh;
        } else {
            return false;
        }
        if(!this.glowingMesh.material.emissiveMap)
            return false;
        this.clock = new Clock();
        this.baseColor = this.glowingMesh.material.emissive.clone();
        this.baseMaterial = this.glowingMesh.material;
        this.glowingMesh.material = this.baseMaterial.clone();
        // If the material has a selective glow map, swap to the full emissive
        // map so the bright animation lights up all labels, not just glow faces.
        // Read from the ORIGINAL material's userData, clone() deep-copies userData
        // via JSON serialization, which destroys CanvasTexture references.
        if (this.baseMaterial.userData.emissiveMapFull) {
            this.glowingMesh.material.emissiveMap = this.baseMaterial.userData.emissiveMapFull;
        }
        this.glowingMesh.material.onBeforeCompile = ShaderUtils.applyDiceSoNiceShader;
        foundry.audio.AudioHelper.play({
            src: PlayAnimationBright.sound,
            volume: this.volume
		}, false);
        this.renderReady = true;
    }

    render() {
        if(!this.renderReady)
            return;
        let x = 1-((PlayAnimationBright.duration - this.clock.getElapsedTime())/PlayAnimationBright.duration);
        if(x>1){
            this.destroy();
        } else {
            let val = (Math.sin(2 * Math.PI * (x - 1/4)) + 1) / 2;
            this.glowingMesh.material.emissive.copy(this.baseColor);
            this.glowingMesh.material.emissive.lerp(PlayAnimationBright.brightColor, val);
        }
    }

    destroy(){
        let sfxMaterial = this.glowingMesh.material;
        this.glowingMesh.material = this.baseMaterial;
        sfxMaterial.dispose();
        this.destroyed = true;
    }
}