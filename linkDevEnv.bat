@echo off
mklink /J %localappdata%\FoundryVTT\Data\modules\dice-so-nice %cd%\dist
mklink /J G:\herd\www\foundry-vtt-server-data\Data\modules\dice-so-nice %cd%\dist