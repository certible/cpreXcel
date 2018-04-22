/* gradeExam.js - grade exam */
/*
Copyright 2018, Certible OG

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

var fs = require('fs');

var allSolutions = require('../data/versionedSolution.json');
var examsInfo    = require("./examInfo.json");

(function() {

function grade (examType,examDate,answers,versions,identifier) {
    var examInfo = examsInfo[examType];

    var solution = {};
    for ( var i in versions ) {
        solution[i] = allSolutions[i][versions[i]];
    }

    var result = {
        "fPoints": 0, 
        "chapterMaxPoints": [],
        "chapterPoints": [],
        "chapterPercentage": [],
        "maxPoints": 0,
        "points": {},
        "correctSum": {},
        "versions": versions, 
        "correct": {},
        "answered": answers
        "hurdle": examInfo.hurdle/100;
    };


    var malusFactor = 0;
    var isAON = false;
    var isAOP = false;

    switch ( examInfo.grader ) {
        case 0:
            malusFactor = 0; //regular w/o malus
            break;
        case 1:
            malusFactor = -1; //regular w/malus
            break;
        case 2:
            var isAON = true; //all or nothing
            break;
        case 3:
            var isAOP = true; //all or max. 1 point
            break;
    }

    var count = {};
    var position = {};
    var pos = 0;
    for ( var i in solution ) {
        position[i] = pos++;
        solution[i].count = 0;
        result.correct[i] = [];

        for ( var j in solution[i].answers ) {
            solution[i].count += solution[i].answers[j] > 0 ? 1 : 0;
        }

        var chap = solution[i].chapter;
        if ( result.chapterMaxPoints[chap] == undefined ) { 
	        result.chapterMaxPoints[chap]  = 0;
        	result.chapterPoints[chap]     = 0;
        	result.chapterPercentage[chap] = 0;
        }
    }


    for ( var i in answers ) {  
        var chap = solution[i].chapter;

        result.maxPoints += solution[i].points;
        result.chapterMaxPoints[chap] += solution[i].points;

        var fFactor = solution[i].points / solution[i].count; 
        var fResult = 0;

        var nCount = 0;
        var nCorrect = 0;

        for ( var j in solution[i].answers ) {
            result.correct[i][j] = ( answers[i][j] == solution[i].answers[j] ) ? 1 : 0;
            if ( answers[i][j] == 0 ) { 
                continue;
            }
            nCount++; 
            nCorrect += answers[i][j] == solution[i].answers[j] ? 1 : 0;
            fResult  += fFactor * ( answers[i][j] == solution[i].answers[j] ? 1 : malusFactor ); 
        }


        if ( nCount > solution[i].count ) { 
            fResult = 0;
        }

        if ( isAOP || isAON ) {
            if ( nCorrect < solution[i].count ) {
                fResult = 0;
            }
            if ( nCorrect == solution[i].count ) { 
                fResult = solution[i].points;
            }
            if ( isAON ) { 
                break;
            }
            if ( ( solution[i].count == 3 && solution[i].points >= 2 ) || ( solution[i].count == 2 && solution[i].points == 3 ) ) {
                if ( nCorrect == (solution[i].count-1) ) {
                    fResult = 1;
                }                
            }
        }
        
        var fPoints = Math.max(0,fResult); 
        
        result.correctSum[i] = nCorrect;
        result.points[i]     = fPoints;
        result.fPoints      += fPoints; 

	    result.chapterPoints[chap] += fPoints;  
    } 

   	for ( var ii in result.chapterPoints ) {
	    result.chapterPercentage[ii] = result.chapterPoints[ii]/result.chapterMaxPoints[ii];
	}

	result.quota = 100 * result.fPoints / result.maxPoints;
    result.passed = ( result.quota >= ( result.hurdle * 100 ) ) ? true : false;
    result.hurdle = result.maxPoints * result.hurdle;
 
    return result;
    }

    module.exports.gradeExam = gradeExam;
})();
