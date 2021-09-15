const { SigningCosmWasmClient } = require("secretjs");
import Tabulator from 'tabulator-tables';
const myStorage = window.localStorage;
const chainId = process.env.CHAIN_ID;



const amountMutator = function(value, data, type, params, component){
	//value - original value of the cell
	//data - the data for the row
	//type - the type of mutation occurring  (data|edit)
	//params - the mutatorParams object from the column definition
	//component - when the "type" argument is "edit", this contains the cell component for the edited cell, otherwise it is the column component for the column
    
	return data.coins.amount / Math.pow(10, params.decimals); //return the new value for the cell data.
}

const coinMutator =  function(value, data, type, params, component){
    return data.coins.denom; 
}

const timeMutator =  function(value, data, type, params, component){
    if (data.block_time === undefined) {return "No data"} else {
        var date = new Date(data.block_time * 1000);
        return date.toLocaleString();
    }
}


window.onload = async () => {

    //prefill contract address
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    var contractAddress = urlParams.get('contract')
    //onsole.log(contract);
    //document.getElementById('contractSelector').value = contractAddress;

    // Keplr extension injects the offline signer that is compatible with secretJS.
    if (!window.getOfflineSigner || !window.keplr) {
        alert("Please install keplr extension");
        document.getElementById("address").append("Keplr not found. Please install Keplr extension for Chrome.");
    }

    // request Keplr to enable the wallet.
    await window.keplr.enable(chainId);
    console.log("Keplr Enabled");

    let offlineSigner = window.getOfflineSigner(chainId);
    window.accounts = await offlineSigner.getAccounts();
    console.log(window.accounts[0].address);

    document.getElementById("address").append(window.accounts[0].address);
    myStorage.setItem(window.accounts[0].address, "You");

};

function buildTable(decimals) {
    window.transferTable = new Tabulator("#transfer-table", {
        height:"500px",
        columns:[
            {title:"ID", field:"id", sorter:"number"},
            {title:"Time", field:"block_time", mutator:timeMutator},
            {title:"Block Height", field:"block_height"},
            {title:"TX Sender", field:"sender"},
            {title:"From", field:"from"},
            {title:"To", field:"receiver"},
            {title:"Memo", field:"memo"},
            {title:"Amount", field:"amount", mutator:amountMutator, mutatorParams:{decimals:decimals}},
            {title:"Coin", field:"denom", mutator:coinMutator},
        ],
    });

    //add listener to trigger download of data.csv file
    document.getElementById("download-csv").addEventListener("click", function(){
        window.transferTable.download("csv", "history.csv");
    });

    //add listener to trigger download of data.json file
    document.getElementById("download-json").addEventListener("click", function(){
        window.transferTable.download("json", "history.json");
    });

}


document.sendForm.onsubmit = () => {
    //prevent reload
    event.preventDefault();

    var contractAddress = document.sendForm.contractAddress.value;

    const tokenInfoQ = { 
        token_info: {}
    };

    const offlineSigner = window.getOfflineSigner(chainId);
	const enigmaUtils = window.getEnigmaUtils(chainId);

    const secretJS = new SigningCosmWasmClient(
		process.env.LCD_API,
		window.accounts[0].address,
		offlineSigner,
		enigmaUtils
	);

    (async () => {
    //query address for decimals
    await secretJS.queryContractSmart(contractAddress, tokenInfoQ).then(function(data) {
        document.getElementById('contractLabel').innerHTML = data.token_info.name;
        buildTable(data.token_info.decimals);

        //get viewing key
        window.keplr.getSecret20ViewingKey(chainId, contractAddress).then(function(viewKey) {
            const historyQuery = { 
                transfer_history: {
                    address: window.accounts[0].address, 
                    key: viewKey,
                    page_size: 1000
                } 
            };

            //query history using viewing key
            secretJS.queryContractSmart(contractAddress, historyQuery).then(function(historyData) {

                //show data in table
                window.transferTable.setData(historyData.transfer_history.txs);

                //replace contrace addresses with human friendly names
                for (const [key, value] of Object.entries(historyData.transfer_history.txs)) {
        
                    //Update "From" field with friendly names
                    if (!localStorage.getItem(value.from)) {
                        fetch(process.env.BACKEND_API + "/contracts/address/" + value.from).then(res => res.json())
                        .then(function(data) {
                            if (data) {
                                window.transferTable.updateData([{id:value.id, from:data.data[0].name}]); 
                            }
                        })
                        .catch(function(error) {
                            console.log(error);
                        });
                    } else {
                        window.transferTable.updateData([{id:value.id, from:localStorage.getItem(value.from)}]);
                    }
        
                    //Update "Sender" field with friendly names
                    if (!localStorage.getItem(value.sender)) {
                        fetch(process.env.BACKEND_API + "/contracts/address/" + value.sender).then(res => res.json())
                        .then(function(data) {
                            
                            if (data) {
                                window.transferTable.updateData([{id:value.id, sender:data.data[0].name}]); 
                            }
                        })
                        .catch(function(error) {
                            console.log(error);
                        });
                    } else {
                        window.transferTable.updateData([{id:value.id, sender:localStorage.getItem(value.sender)}]);
                    }
        
                    //Update "Receiver" field with friendly names
                    if (!localStorage.getItem(value.receiver)) {
                        fetch(process.env.BACKEND_API + "/contracts/address/" + value.receiver).then(res => res.json())
                        .then(function(data) {
                            if (data) {
                                window.transferTable.updateData([{id:value.id, receiver:data.data[0].name}]); 
                            }
                        })
                        .catch(function(error) {
                            console.log(error);
                        });
                    } else {
                        window.transferTable.updateData([{id:value.id, receiver:localStorage.getItem(value.receiver)}]);
                    }
                }

            }).catch(function(error) {
                //query history errors
                console.log(error);
            });

        }).catch(function(error) {
            //get view key from keplr errors
            console.log(error);
        });

    }).catch(function(error) {
        //token_info query errors or error getting decimals/name
        console.log(error);
    });

})();

    //prevent reload
    return false;
};