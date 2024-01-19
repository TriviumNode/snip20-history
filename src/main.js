const { SigningCosmWasmClient } = require("secretjs");
import Tabulator from 'tabulator-tables';
const myStorage = window.localStorage;

let secretJS;



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

const heightMutator =  function(value, data, type, params, component){
    return data.block_height || "Unsupported"; 
}

const timeMutator =  function(value, data, type, params, component){
    if (data.block_time === undefined) {return "Unsupported"} else {
        var date = new Date(data.block_time * 1000);
        return date.toLocaleString();
    }
}

const ContractDb = new Map();
ContractDb.set('secret1tvhnydaakdp5tg2jhedhmc88nryjefn4j5dup2', 'ALTER Pay')


window.onload = async () => {

    //prefill contract address
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    const contractAddress = urlParams.get('contract')
    if (contractAddress) {
        // document.getElementById('contractSelector').value = 'OtherContract';
        $('#contractSelector').val('OtherContract');
        $('#contractAddress').val(contractAddress);
        $("#contractAddress").removeAttr("disabled");
    }

    const urlToken = urlParams.get('token');
    if (urlToken) {
        $('#contractSelector').val(urlToken);
        $('#contractAddress').val(urlToken);
    }

    // Keplr extension injects the offline signer that is compatible with secretJS.
    if (!window.keplr) {
        alert("Please install keplr extension");
        document.getElementById("address").append("Keplr not found. Please install Keplr extension for Chrome.");
    }

    // request Keplr to enable the wallet.
    await window.keplr.enable(process.env.CHAIN_ID);
    console.log("Keplr Enabled");

    let offlineSigner = window.keplr.getOfflineSigner(process.env.CHAIN_ID);
    window.accounts = await offlineSigner.getAccounts();
    console.log(window.accounts[0].address);

    document.getElementById("address").append(window.accounts[0].address);
    myStorage.setItem(window.accounts[0].address, "You");
    ContractDb.set(window.accounts[0].address, "You")
};

function buildTable(decimals) {
    window.transferTable = new Tabulator("#transfer-table", {
        height:"480px",
        columns:[
            {title:"ID", field:"id", sorter:"number", headerTooltip: "Internal Transfer ID"},
            {title:"Time", field:"block_time", mutator:timeMutator, headerTooltip: "Transfer time. Not supported by all tokens."},
            {title:"Block Height", field:"block_height",  mutator:heightMutator, headerTooltip: "Transfer Block. Not supported by all tokens."}, 
            {title:"From", field:"from", headerTooltip: "Address or contract that the token was deducted from."},
            {title:"To", field:"receiver", headerTooltip: "Address or contract that the token was credited to."},
            {title:"Amount", field:"amount", mutator:amountMutator, mutatorParams:{decimals:decimals}},
            {title:"Coin", field:"denom", mutator:coinMutator},
            {title:"Memo", field:"memo", headerTooltip: "Private memo. Not supported by all tokens."},
            {title:"TX Sender", field:"sender", headerTooltip: "Address or Contract that initiated the transfer."},
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

const queryData = async(contractAddress, viewKey, data) => {
        //get viewing key
        if (!viewKey) viewKey = await window.keplr.getSecret20ViewingKey(process.env.CHAIN_ID, contractAddress);

        //query balance using viewing key
        const balanceQuery = { 
            balance: {
                key: viewKey, 
                address: window.accounts[0].address
            }
        };

        const balanceData = await secretJS.queryContractSmart(contractAddress, balanceQuery);
        const humanBalance = balanceData.balance.amount / Math.pow(10, data.token_info.decimals);
        console.log("balance", humanBalance, data.token_info.decimals, balanceData.balance);
        document.getElementById('balance-div').innerHTML = `Balance: ${humanBalance}`;

        //query history using viewing key
        const historyQuery = { 
            transfer_history: {
                address: window.accounts[0].address, 
                key: viewKey,
                page_size: 1000,
                should_filter_decoys: true,
            } 
        };
        
        const historyData = await secretJS.queryContractSmart(contractAddress, historyQuery);

        //show data in table
        window.transferTable.setData(historyData.transfer_history.txs);

        //replace contract addresses with human friendly names
        for (const [key, value] of Object.entries(historyData.transfer_history.txs)) {

            //Update "From" field with friendly names
            if (process.env.USE_BACKEND==='true'){
                if (!localStorage.getItem(value.from)) {
                    fetch(process.env.BACKEND_API + "/contracts/address/" + value.from).then(res => res.json())
                    .then(function(data) {
                        if (data) {
                            window.transferTable.updateData([{id:value.id, from:data.data[0].name || data.data[0].label}]); 
                        }
                    })
                    .catch(function(error) {
                        console.log(error);
                    });
                } else {
                    window.transferTable.updateData([{id:value.id, from:localStorage.getItem(value.from)}]);
                }
            } else {
                const dbName = ContractDb.get(value.from);
                if (dbName) window.transferTable.updateData([{id: value.id, from: dbName}]); 
            }

            //Update "Sender" field with friendly names
            if (process.env.USE_BACKEND==='true'){
                if (!localStorage.getItem(value.sender)) {
                    fetch(process.env.BACKEND_API + "/contracts/address/" + value.sender).then(res => res.json())
                    .then(function(data) {
                        
                        if (data) {
                            window.transferTable.updateData([{id:value.id, sender:data.data[0].name || data.data[0].label}]); 
                        }
                    })
                    .catch(function(error) {
                        console.log(error);
                    });
                } else {
                    window.transferTable.updateData([{id:value.id, sender:localStorage.getItem(value.sender)}]);
                }
            } else {
                const dbName = ContractDb.get(value.sender);
                if (dbName) window.transferTable.updateData([{id: value.id, sender: dbName}]); 
            }

            //Update "Receiver" field with friendly names
            if (process.env.USE_BACKEND==='true'){
                if (!localStorage.getItem(value.receiver)) {
                    fetch(process.env.BACKEND_API + "/contracts/address/" + value.receiver).then(res => res.json())
                    .then(function(data) {
                        if (data) {
                            window.transferTable.updateData([{id:value.id, receiver:data.data[0].name || data.data[0].label}]); 
                        }
                    })
                    .catch(function(error) {
                        console.log(error);
                    });
                } else {
                    window.transferTable.updateData([{id:value.id, receiver:localStorage.getItem(value.receiver)}]);
                }
            } else {
                const dbName = ContractDb.get(value.receiver);
                if (dbName) window.transferTable.updateData([{id: value.id, receiver: dbName}]); 
            }
        }
}


document.sendForm.onsubmit = () => {
    //prevent reload
    event.preventDefault();

    var contractAddress = document.sendForm.contractAddress.value;

    const tokenInfoQ = { 
        token_info: {}
    };

    const offlineSigner = window.keplr.getOfflineSigner(process.env.CHAIN_ID);
	const enigmaUtils = window.keplr.getEnigmaUtils(process.env.CHAIN_ID);

    secretJS = new SigningCosmWasmClient(
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
        window.keplr.getSecret20ViewingKey(process.env.CHAIN_ID, contractAddress).then(function(viewKey) {
            queryData(contractAddress, viewKey, data);
            //query balance using viewing key
            // const balanceQuery = { 
            //     balance: {
            //         key: viewKey, 
            //         address: window.accounts[0].address
            //     }
            // };
            // secretJS.queryContractSmart(contractAddress, balanceQuery).then(function(balanceData) {
            //     let balance = balanceData.balance.amount / Math.pow(10, data.token_info.decimals);
            //     console.log("balance", balance, data.token_info.decimals, balanceData.balance);
            //     document.getElementById('balance-div').innerHTML = `Balance: ${balance}`;
                
            // }).catch(function(error) {
            //     //query balance errors
            //     console.log(error);
            // });

          //query history using viewing key
            // const historyQuery = { 
            //     transfer_history: {
            //         address: window.accounts[0].address, 
            //         key: viewKey,
            //         page_size: 1000
            //     } 
            // };
            // secretJS.queryContractSmart(contractAddress, historyQuery).then(function(historyData) {

            //     //show data in table
            //     window.transferTable.setData(historyData.transfer_history.txs);

            //     //replace contract addresses with human friendly names
            //     for (const [key, value] of Object.entries(historyData.transfer_history.txs)) {
        
            //         //Update "From" field with friendly names
            //         if (process.env.USE_BACKEND==='true'){
            //             if (!localStorage.getItem(value.from)) {
            //                 fetch(process.env.BACKEND_API + "/contracts/address/" + value.from).then(res => res.json())
            //                 .then(function(data) {
            //                     if (data) {
            //                         window.transferTable.updateData([{id:value.id, from:data.data[0].name || data.data[0].label}]); 
            //                     }
            //                 })
            //                 .catch(function(error) {
            //                     console.log(error);
            //                 });
            //             } else {
            //                 window.transferTable.updateData([{id:value.id, from:localStorage.getItem(value.from)}]);
            //             }
            //         }
        
            //         //Update "Sender" field with friendly names
            //         if (process.env.USE_BACKEND==='true'){
            //             if (!localStorage.getItem(value.sender)) {
            //                 fetch(process.env.BACKEND_API + "/contracts/address/" + value.sender).then(res => res.json())
            //                 .then(function(data) {
                                
            //                     if (data) {
            //                         window.transferTable.updateData([{id:value.id, sender:data.data[0].name || data.data[0].label}]); 
            //                     }
            //                 })
            //                 .catch(function(error) {
            //                     console.log(error);
            //                 });
            //             } else {
            //                 window.transferTable.updateData([{id:value.id, sender:localStorage.getItem(value.sender)}]);
            //             }
            //         }
        
            //         //Update "Receiver" field with friendly names
            //         if (process.env.USE_BACKEND==='true'){
            //             if (!localStorage.getItem(value.receiver)) {
            //                 fetch(process.env.BACKEND_API + "/contracts/address/" + value.receiver).then(res => res.json())
            //                 .then(function(data) {
            //                     if (data) {
            //                         window.transferTable.updateData([{id:value.id, receiver:data.data[0].name || data.data[0].label}]); 
            //                     }
            //                 })
            //                 .catch(function(error) {
            //                     console.log(error);
            //                 });
            //             } else {
            //                 window.transferTable.updateData([{id:value.id, receiver:localStorage.getItem(value.receiver)}]);
            //             }
            //         }
            //     }

            // }).catch(function(error) {
            //     //query history errors
            //     console.log(error);
            // });

        }).catch(function(error) {
            if (error.toString().includes('no matched') || error.toString().includes(`key doesn't exist`)){
                window.keplr.suggestToken(process.env.CHAIN_ID, contractAddress).then((result)=>{
                    console.log('Suggest Token', result)
                    queryData(contractAddress, undefined, data);
                }).catch((err)=>{
                    console.error(err);
                })
            }
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